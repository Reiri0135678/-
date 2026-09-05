import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import {
  COLORS,
  NOTE_COLORS,
  defaultsFor,
  normalizeShape,
  type ArrowBinding,
  type ArrowShape,
  type Shape,
  type ShapeType
} from '@shared/shapes'

/**
 * ボードエディタの中核。tldraw を置き換える自作実装。
 * - 文書: Yjs(Y.Map<shapeId, Y.Map<field, value>>)。y-websocket 互換の自前サーバーと同期
 * - 状態: 不変のスナップショットを購読(React は useSyncExternalStore で読む)
 * - 取り消し: Y.UndoManager(自分の変更だけを対象にする)
 * - 在席: awareness(名前・色・カーソル・選択)
 */

export type ToolId =
  | 'select'
  | 'hand'
  | 'draw'
  | 'highlight'
  | 'eraser'
  | 'text'
  | 'note'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'request-card'

export interface Camera {
  x: number
  y: number
  scale: number
}
export interface Point {
  x: number
  y: number
}
export interface Collaborator {
  clientId: number
  name: string
  color: string
  cursor: Point | null
  selection: string[]
  /** 描画途中の図形(ペンの線など)。書き終える前から相手に見せる */
  draft: Shape | null
}
export interface Style {
  color: string
  size: number
  noteColor: string
  fill: string
}
export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface EditorSnapshot {
  shapes: Shape[]
  byId: ReadonlyMap<string, Shape>
  selection: string[]
  tool: ToolId
  camera: Camera
  collaborators: Collaborator[]
  status: ConnectionStatus
  readonly: boolean
  canUndo: boolean
  canRedo: boolean
  editingId: string | null
  style: Style
  version: number
}

export interface EditorOptions {
  roomId: string
  userName: string
  readonly: boolean
  /** WebSocket の接続先。省略時は同一ホストの /api/connect */
  wsBase?: string
}

const LOCAL = Symbol('local')
const MIN_SCALE = 0.1
const MAX_SCALE = 8

function userColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const palette = ['#d97757', '#6a9bcc', '#788c5d', '#b5462b', '#7b5c9c', '#3f6f9e', '#c9922a']
  return palette[h % palette.length]!
}

export function newId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export class BoardEditor {
  readonly doc = new Y.Doc()
  readonly shapesMap: Y.Map<Y.Map<unknown>>
  readonly provider: WebsocketProvider
  readonly undo: Y.UndoManager
  readonly userName: string
  readonly userColor: string
  private readonly listeners = new Set<() => void>()
  private snapshot: EditorSnapshot
  private viewport = { w: 1000, h: 700 }
  private cursorTimer: number | null = null
  private pendingCursor: Point | null | undefined

  constructor(opts: EditorOptions) {
    this.userName = opts.userName
    this.userColor = userColor(opts.userName)
    this.shapesMap = this.doc.getMap('shapes') as Y.Map<Y.Map<unknown>>

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const base = opts.wsBase ?? `${proto}://${window.location.host}/api/connect`
    this.provider = new WebsocketProvider(base, encodeURIComponent(opts.roomId), this.doc, { disableBc: true })

    this.undo = new Y.UndoManager(this.shapesMap, { trackedOrigins: new Set([LOCAL]), captureTimeout: 300 })

    this.snapshot = {
      shapes: [],
      byId: new Map(),
      selection: [],
      tool: 'select',
      camera: { x: 0, y: 0, scale: 1 },
      collaborators: [],
      status: 'connecting',
      readonly: opts.readonly,
      canUndo: false,
      canRedo: false,
      editingId: null,
      style: { color: COLORS[0], size: 3, noteColor: NOTE_COLORS[0], fill: 'transparent' },
      version: 0
    }

    this.shapesMap.observeDeep(() => this.rebuildShapes())
    this.undo.on('stack-item-added', () => this.patch({}))
    this.undo.on('stack-item-popped', () => this.patch({}))

    this.provider.awareness.setLocalStateField('user', { name: this.userName, color: this.userColor })
    this.provider.awareness.on('change', () => this.rebuildCollaborators())
    this.provider.on('status', ({ status }: { status: string }) => {
      if (status === 'disconnected') this.patch({ status: 'offline' })
      else if (status === 'connecting') this.patch({ status: 'connecting' })
      else if (status === 'connected' && this.provider.synced) this.patch({ status: 'online' })
    })
    this.provider.on('sync', (synced: boolean) => {
      if (synced) {
        this.patch({ status: 'online' })
        this.rebuildShapes()
      }
    })
  }

  destroy(): void {
    this.provider.awareness.setLocalState(null)
    this.provider.destroy()
    this.undo.destroy()
    this.doc.destroy()
    this.listeners.clear()
  }

  // ---- 購読 ------------------------------------------------------------
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getSnapshot = (): EditorSnapshot => this.snapshot

  private patch(p: Partial<EditorSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...p,
      canUndo: this.undo.canUndo(),
      canRedo: this.undo.canRedo(),
      version: this.snapshot.version + 1
    }
    for (const l of this.listeners) l()
  }

  private rebuildShapes(): void {
    const shapes: Shape[] = []
    this.shapesMap.forEach((m) => {
      const s = normalizeShape(m.toJSON() as Record<string, unknown>)
      if (s) shapes.push(s)
    })
    shapes.sort((a, b) => a.z - b.z)
    const byId = new Map(shapes.map((s) => [s.id, s]))
    const selection = this.snapshot.selection.filter((id) => byId.has(id))
    const editingId = this.snapshot.editingId && byId.has(this.snapshot.editingId) ? this.snapshot.editingId : null
    this.patch({ shapes, byId, selection, editingId })
  }

  private rebuildCollaborators(): void {
    const me = this.provider.awareness.clientID
    const list: Collaborator[] = []
    this.provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === me || !state || !state['user']) return
      const u = state['user'] as { name: string; color: string }
      list.push({
        clientId,
        name: u.name,
        color: u.color,
        cursor: (state['cursor'] as Point | null) ?? null,
        selection: (state['selection'] as string[]) ?? [],
        draft: (state['draft'] as Shape | null) ?? null
      })
    })
    this.patch({ collaborators: list })
  }

  // ---- 図形 ------------------------------------------------------------
  getShapes(): Shape[] {
    return this.snapshot.shapes
  }
  getShape<T extends Shape = Shape>(id: string): T | undefined {
    return this.snapshot.byId.get(id) as T | undefined
  }
  getSelectedShapes(): Shape[] {
    return this.snapshot.selection.map((id) => this.snapshot.byId.get(id)!).filter(Boolean)
  }
  isReadonly(): boolean {
    return this.snapshot.readonly
  }

  private nextZ(): number {
    const s = this.snapshot.shapes
    return s.length ? s[s.length - 1]!.z + 1 : 1
  }

  /** 図形を作成して返す。type 以外は省略可 */
  createShape<T extends Shape = Shape>(init: { type: ShapeType; x?: number; y?: number } & Partial<T>): T {
    const shape = {
      ...defaultsFor(init.type),
      ...init,
      id: (init as { id?: string }).id ?? newId(),
      x: init.x ?? 0,
      y: init.y ?? 0,
      z: this.nextZ(),
      by: this.userName,
      updatedAt: Date.now()
    } as T
    this.doc.transact(() => {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(shape)) m.set(k, v)
      this.shapesMap.set(shape.id, m)
    }, LOCAL)
    return shape
  }

  updateShape<T extends Shape = Shape>(id: string, patch: Partial<T>): void {
    this.updateShapes([{ id, patch: patch as Partial<Shape> }])
  }

  updateShapes(updates: Array<{ id: string; patch: Partial<Shape> }>): void {
    if (this.snapshot.readonly) return
    // 位置・大きさが変わる図形に吸着している矢印は、変更後の位置に合わせて端点を動かす
    const moved = new Set(updates.filter((u) => ['x', 'y', 'w', 'h', 'rotation', 'dx', 'dy'].some((k) => k in u.patch)).map((u) => u.id))
    if (moved.size) {
      const next = new Map(this.snapshot.byId)
      for (const { id, patch } of updates) {
        const cur = next.get(id)
        if (cur) next.set(id, { ...cur, ...patch } as Shape)
      }
      for (const s of this.snapshot.shapes) {
        if (s.type !== 'arrow' || updates.some((u) => u.id === s.id)) continue
        if (!((s.startBind && moved.has(s.startBind.id)) || (s.endBind && moved.has(s.endBind.id)))) continue
        const r = resolveArrow(s, (id) => next.get(id))
        updates = [...updates, { id: s.id, patch: r }]
      }
    }
    this.doc.transact(() => {
      for (const { id, patch } of updates) {
        const m = this.shapesMap.get(id)
        if (!m) continue
        let changed = false
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'id' || k === 'type') continue
          const cur = m.get(k)
          if (cur === v || (Array.isArray(v) && JSON.stringify(cur) === JSON.stringify(v))) continue
          m.set(k, v)
          changed = true
        }
        if (changed) {
          m.set('by', this.userName)
          m.set('updatedAt', Date.now())
        }
      }
    }, LOCAL)
  }

  /** 削除。依頼カードは記録として残すため物理削除せず「取消」にする */
  deleteShapes(ids: string[]): void {
    if (this.snapshot.readonly || ids.length === 0) return
    const cards = ids.filter((id) => this.snapshot.byId.get(id)?.type === 'request-card')
    const others = ids.filter((id) => !cards.includes(id))
    if (cards.length) {
      this.updateShapes(cards.map((id) => ({ id, patch: { status: '取消' } as Partial<Shape> })))
    }
    if (others.length === 0) {
      this.select(this.snapshot.selection.filter((id) => !ids.includes(id)))
      return
    }
    ids = others
    this.doc.transact(() => {
      for (const id of ids) this.shapesMap.delete(id)
      // 消えた図形に吸着していた矢印は吸着を外す
      this.shapesMap.forEach((m) => {
        if (m.get('type') !== 'arrow') return
        for (const k of ['startBind', 'endBind'] as const) {
          const b = m.get(k) as ArrowBinding | null
          if (b && ids.includes(b.id)) m.set(k, null)
        }
      })
      // 図面が消えたらカードの紐付けからも外す
      this.shapesMap.forEach((m) => {
        const linked = m.get('linkedShapeIds')
        if (Array.isArray(linked) && linked.some((x) => ids.includes(x as string))) {
          m.set(
            'linkedShapeIds',
            (linked as string[]).filter((x) => !ids.includes(x))
          )
        }
      })
    }, LOCAL)
    this.select(this.snapshot.selection.filter((id) => !ids.includes(id)))
  }

  bringToFront(ids: string[]): void {
    let z = this.nextZ()
    this.updateShapes(ids.map((id) => ({ id, patch: { z: z++ } })))
  }

  duplicate(ids: string[]): string[] {
    const created: string[] = []
    for (const id of ids) {
      const s = this.snapshot.byId.get(id)
      if (!s) continue
      const { id: _id, z: _z, ...rest } = s
      void _id
      void _z
      const c = this.createShape({ ...rest, x: s.x + 20, y: s.y + 20 })
      created.push(c.id)
    }
    return created
  }

  // ---- 選択 ------------------------------------------------------------
  select(ids: string | string[]): void {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => this.snapshot.byId.has(id))
    this.patch({ selection: list })
    this.provider.awareness.setLocalStateField('selection', list)
  }
  selectNone(): void {
    this.select([])
  }

  // ---- ツール・スタイル ------------------------------------------------
  setTool(tool: ToolId): void {
    if (this.snapshot.readonly && tool !== 'select' && tool !== 'hand') return
    this.patch({ tool, editingId: null })
  }
  setStyle(p: Partial<Style>): void {
    const style = { ...this.snapshot.style, ...p }
    this.patch({ style })
    // 選択中の図形にも適用
    const sel = this.getSelectedShapes()
    if (sel.length === 0) return
    this.updateShapes(
      sel.map((s) => {
        const patch: Partial<Shape> = {}
        if (p.color !== undefined && 'color' in s && s.type !== 'note') (patch as { color: string }).color = p.color
        if (p.size !== undefined && 'size' in s) (patch as { size: number }).size = p.size
        if (p.noteColor !== undefined && s.type === 'note') (patch as { color: string }).color = p.noteColor
        if (p.fill !== undefined && (s.type === 'rect' || s.type === 'ellipse')) (patch as { fill: string }).fill = p.fill
        return { id: s.id, patch }
      })
    )
  }
  setEditing(id: string | null): void {
    this.patch({ editingId: id })
  }

  // ---- 取り消し ----------------------------------------------------------
  undoOnce(): void {
    this.undo.undo()
  }
  redoOnce(): void {
    this.undo.redo()
  }

  // ---- カメラ ----------------------------------------------------------
  setViewport(w: number, h: number): void {
    this.viewport = { w, h }
  }
  setCamera(c: Partial<Camera>): void {
    const camera = { ...this.snapshot.camera, ...c }
    camera.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale))
    this.patch({ camera })
  }
  /** 画面上の点を中心にズーム */
  zoomBy(factor: number, screen?: Point): void {
    const c = this.snapshot.camera
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor))
    const p = screen ?? { x: this.viewport.w / 2, y: this.viewport.h / 2 }
    const page = this.screenToPage(p)
    this.setCamera({ scale: s, x: p.x - page.x * s, y: p.y - page.y * s })
  }
  screenToPage(p: Point): Point {
    const c = this.snapshot.camera
    return { x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale }
  }
  pageToScreen(p: Point): Point {
    const c = this.snapshot.camera
    return { x: p.x * c.scale + c.x, y: p.y * c.scale + c.y }
  }
  zoomToBounds(b: { x: number; y: number; w: number; h: number }, padding = 60): void {
    const { w, h } = this.viewport
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((w - padding * 2) / Math.max(b.w, 1), (h - padding * 2) / Math.max(b.h, 1), 2)))
    this.setCamera({ scale, x: w / 2 - (b.x + b.w / 2) * scale, y: h / 2 - (b.y + b.h / 2) * scale })
  }
  zoomToFit(): void {
    const b = boundsOf(this.snapshot.shapes)
    if (b) this.zoomToBounds(b)
  }
  zoomTo(id: string): void {
    const s = this.snapshot.byId.get(id)
    if (!s) return
    this.select(id)
    const b = boundsOf([s])!
    this.zoomToBounds(b, 160)
  }

  // ---- 在席 ------------------------------------------------------------
  setCursor(p: Point | null): void {
    this.pendingCursor = p
    if (this.cursorTimer !== null) return
    this.cursorTimer = window.setTimeout(() => {
      this.cursorTimer = null
      this.provider.awareness.setLocalStateField('cursor', this.pendingCursor ?? null)
    }, 40)
  }
  getCollaborators(): Collaborator[] {
    return this.snapshot.collaborators
  }
  private draftTimer: number | null = null
  private pendingDraft: Shape | null | undefined
  /** 描画途中の図形を在席情報に載せて相手に見せる(40ms 間隔) */
  setDraft(shape: Shape | null): void {
    this.pendingDraft = shape
    if (shape === null) {
      if (this.draftTimer !== null) {
        clearTimeout(this.draftTimer)
        this.draftTimer = null
      }
      this.provider.awareness.setLocalStateField('draft', null)
      return
    }
    if (this.draftTimer !== null) return
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null
      this.provider.awareness.setLocalStateField('draft', this.pendingDraft ?? null)
    }, 40)
  }

  /** 点の下にある図形(最前面)。矢印の吸着先を探すのに使う */
  shapeAt(p: Point, exclude: string[] = []): Shape | null {
    const list = this.snapshot.shapes
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!
      if (exclude.includes(s.id) || s.type === 'arrow' || s.type === 'draw') continue
      if (s.type === 'request-card' && s.archived) continue
      const b = shapeBounds(s)
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return s
    }
    return null
  }
}

/** 吸着情報から矢印の x,y,dx,dy を求める。端点は吸着先の外周まで引く */
export function resolveArrow(a: ArrowShape, get: (id: string) => Shape | undefined): Pick<ArrowShape, 'x' | 'y' | 'dx' | 'dy'> {
  let start: Point = { x: a.x, y: a.y }
  let end: Point = { x: a.x + a.dx, y: a.y + a.dy }
  const sShape = a.startBind ? get(a.startBind.id) : undefined
  const eShape = a.endBind ? get(a.endBind.id) : undefined
  if (sShape && a.startBind) start = anchorPoint(sShape, a.startBind)
  if (eShape && a.endBind) end = anchorPoint(eShape, a.endBind)
  if (eShape) end = clipToBounds(start, end, shapeBounds(eShape), 6)
  if (sShape) start = clipToBounds(end, start, shapeBounds(sShape), 6)
  return { x: start.x, y: start.y, dx: end.x - start.x, dy: end.y - start.y }
}

export function anchorPoint(s: Shape, b: ArrowBinding): Point {
  const r = shapeBounds(s)
  return { x: r.x + r.w * b.nx, y: r.y + r.h * b.ny }
}

export function bindingFor(s: Shape, p: Point): ArrowBinding {
  const r = shapeBounds(s)
  return { id: s.id, nx: r.w ? Math.min(1, Math.max(0, (p.x - r.x) / r.w)) : 0.5, ny: r.h ? Math.min(1, Math.max(0, (p.y - r.y) / r.h)) : 0.5 }
}

/** from → to の線分が矩形(pad で外側に広げたもの)に入る点を返す。入らなければ to のまま */
function clipToBounds(from: Point, to: Point, r: { x: number; y: number; w: number; h: number }, pad: number): Point {
  const x0 = r.x - pad
  const y0 = r.y - pad
  const x1 = r.x + r.w + pad
  const y1 = r.y + r.h + pad
  const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  if (inside(from)) return to
  const dx = to.x - from.x
  const dy = to.y - from.y
  let tMin = Infinity
  const consider = (t: number, ok: boolean) => {
    if (ok && t >= 0 && t <= 1 && t < tMin) tMin = t
  }
  if (dx !== 0) {
    for (const X of [x0, x1]) {
      const t = (X - from.x) / dx
      const y = from.y + dy * t
      consider(t, y >= y0 && y <= y1)
    }
  }
  if (dy !== 0) {
    for (const Y of [y0, y1]) {
      const t = (Y - from.y) / dy
      const x = from.x + dx * t
      consider(t, x >= x0 && x <= x1)
    }
  }
  if (!Number.isFinite(tMin)) return to
  return { x: from.x + dx * tMin, y: from.y + dy * tMin }
}

/** 図形の外接矩形(回転は無視) */
export function shapeBounds(s: Shape): { x: number; y: number; w: number; h: number } {
  if (s.type === 'arrow') {
    return { x: Math.min(s.x, s.x + s.dx), y: Math.min(s.y, s.y + s.dy), w: Math.abs(s.dx) || 1, h: Math.abs(s.dy) || 1 }
  }
  return { x: s.x, y: s.y, w: s.w || 1, h: s.h || 1 }
}

export function boundsOf(shapes: Shape[]): { x: number; y: number; w: number; h: number } | null {
  if (shapes.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of shapes) {
    const b = shapeBounds(s)
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
