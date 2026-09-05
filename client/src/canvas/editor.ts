import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import {
  CLIPBOARD_MARK,
  COLORS,
  DEFAULT_PAGE,
  NOTE_COLORS,
  defaultsFor,
  tableSize,
  normalizeComment,
  normalizeShape,
  shapeTexts,
  type ArrowBinding,
  type ArrowShape,
  type CommentThread,
  type GeoKind,
  type ImageShape,
  type LineDash,
  type TableShape,
  type PageInfo,
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

import type { Camera, Collaborator, EditorOptions, EditorSnapshot, Point, Style, ToolId } from './types'
import { boundsOf, resolveArrow, shapeBounds } from './geometry'
import { remapShapes } from './clone'
import { newGroupId, newId } from './ids'

export { newId } from './ids'

export type { Camera, Collaborator, ConnectionStatus, EditorOptions, EditorSnapshot, Point, Style, ToolId } from './types'

const LOCAL = Symbol('local')
const MIN_SCALE = 0.1
const MAX_SCALE = 8

function userColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const palette = ['#d97757', '#6a9bcc', '#788c5d', '#b5462b', '#7b5c9c', '#3f6f9e', '#c9922a']
  return palette[h % palette.length]!
}


export class BoardEditor {
  readonly doc = new Y.Doc()
  readonly shapesMap: Y.Map<Y.Map<unknown>>
  readonly pagesMap: Y.Map<{ name: string; order: number }>
  readonly commentsMap: Y.Map<Y.Map<unknown>>
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
    this.pagesMap = this.doc.getMap('pages') as Y.Map<{ name: string; order: number }>
    this.commentsMap = this.doc.getMap('comments') as Y.Map<Y.Map<unknown>>

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const base = opts.wsBase ?? `${proto}://${window.location.host}/api/connect`
    this.provider = new WebsocketProvider(base, encodeURIComponent(opts.roomId), this.doc, { disableBc: true })

    this.undo = new Y.UndoManager(this.shapesMap, { trackedOrigins: new Set([LOCAL]), captureTimeout: 300 })

    this.snapshot = {
      shapes: [],
      allShapes: [],
      byId: new Map(),
      pages: [{ id: DEFAULT_PAGE, name: 'ページ 1', order: 0 }],
      currentPage: DEFAULT_PAGE,
      comments: [],
      showResolved: false,
      following: null,
      editingCell: null,
      cropping: null,
      selection: [],
      tool: 'select',
      camera: { x: 0, y: 0, scale: 1 },
      collaborators: [],
      status: 'connecting',
      readonly: opts.readonly,
      canUndo: false,
      canRedo: false,
      editingId: null,
      style: { color: COLORS[0], size: 3, noteColor: NOTE_COLORS[0], fill: 'transparent', fontSize: 18, bold: false, italic: false, underline: false, align: 'left', dash: 'solid', geoKind: 'rect' },
      version: 0
    }

    this.shapesMap.observeDeep(() => this.rebuildShapes())
    this.pagesMap.observe(() => this.rebuildShapes())
    this.commentsMap.observeDeep(() => this.rebuildComments())
    this.undo.on('stack-item-added', () => this.patch({}))
    this.undo.on('stack-item-popped', () => this.patch({}))

    this.provider.awareness.setLocalStateField('user', { name: this.userName, color: this.userColor })
    this.provider.awareness.setLocalStateField('page', DEFAULT_PAGE)
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
        this.rebuildComments()
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
    const allShapes: Shape[] = []
    this.shapesMap.forEach((m) => {
      const s = normalizeShape(m.toJSON() as Record<string, unknown>)
      if (s) allShapes.push(s)
    })
    allShapes.sort((a, b) => a.z - b.z)
    const byId = new Map(allShapes.map((s) => [s.id, s]))
    // ページ一覧(未定義なら最初のページだけ)
    const pages: PageInfo[] = []
    this.pagesMap.forEach((v, id) => pages.push({ id, name: v.name, order: v.order }))
    if (!pages.some((p) => p.id === DEFAULT_PAGE)) pages.push({ id: DEFAULT_PAGE, name: 'ページ 1', order: -1 })
    pages.sort((a, b) => a.order - b.order)
    const currentPage = pages.some((p) => p.id === this.snapshot.currentPage) ? this.snapshot.currentPage : DEFAULT_PAGE
    const shapes = allShapes.filter((s) => s.page === currentPage)
    const selection = this.snapshot.selection.filter((id) => byId.get(id)?.page === currentPage)
    const editingId = this.snapshot.editingId && byId.has(this.snapshot.editingId) ? this.snapshot.editingId : null
    this.patch({ shapes, allShapes, byId, pages, currentPage, selection, editingId })
  }

  private rebuildComments(): void {
    const comments: CommentThread[] = []
    this.commentsMap.forEach((m) => {
      const c = normalizeComment(m.toJSON() as Record<string, unknown>)
      if (c) comments.push(c)
    })
    comments.sort((a, b) => a.ts - b.ts)
    this.patch({ comments })
  }

  // ---- ページ ----------------------------------------------------------
  setPage(id: string): void {
    if (!this.snapshot.pages.some((p) => p.id === id) || id === this.snapshot.currentPage) return
    this.snapshot = { ...this.snapshot, currentPage: id, selection: [], editingId: null }
    this.provider.awareness.setLocalStateField('page', id)
    this.provider.awareness.setLocalStateField('selection', [])
    this.rebuildShapes()
  }
  addPage(name?: string): string {
    if (this.snapshot.readonly) return this.snapshot.currentPage
    const id = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const order = Math.max(0, ...this.snapshot.pages.map((p) => p.order)) + 1
    this.doc.transact(() => {
      if (!this.pagesMap.has(DEFAULT_PAGE)) this.pagesMap.set(DEFAULT_PAGE, { name: 'ページ 1', order: -1 })
      this.pagesMap.set(id, { name: name ?? `ページ ${this.snapshot.pages.length + 1}`, order })
    }, LOCAL)
    this.setPage(id)
    return id
  }
  renamePage(id: string, name: string): void {
    if (this.snapshot.readonly || !name.trim()) return
    const cur = this.pagesMap.get(id) ?? { name: 'ページ 1', order: -1 }
    this.doc.transact(() => this.pagesMap.set(id, { ...cur, name: name.trim() }), LOCAL)
  }
  /** 図形が無いページだけ削除できる。成功なら true */
  deletePage(id: string): boolean {
    if (this.snapshot.readonly || id === DEFAULT_PAGE) return false
    if (this.snapshot.allShapes.some((s) => s.page === id)) return false
    this.doc.transact(() => this.pagesMap.delete(id), LOCAL)
    if (this.snapshot.currentPage === id) this.setPage(DEFAULT_PAGE)
    return true
  }

  // ---- コメント ----------------------------------------------------------
  addComment(init: { shapeId: string | null; x: number; y: number; text: string }): string {
    const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const c: CommentThread = {
      id,
      page: this.snapshot.currentPage,
      shapeId: init.shapeId,
      x: init.x,
      y: init.y,
      author: this.userName,
      text: init.text,
      ts: Date.now(),
      resolved: false,
      replies: []
    }
    this.doc.transact(() => {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(c)) m.set(k, v)
      this.commentsMap.set(id, m)
    }, 'comment')
    return id
  }
  replyComment(id: string, text: string): void {
    const m = this.commentsMap.get(id)
    if (!m || !text.trim()) return
    const replies = [...((m.get('replies') as CommentThread['replies']) ?? []), { author: this.userName, text: text.trim(), ts: Date.now() }]
    this.doc.transact(() => m.set('replies', replies), 'comment')
  }
  resolveComment(id: string, resolved: boolean): void {
    const m = this.commentsMap.get(id)
    if (!m) return
    this.doc.transact(() => m.set('resolved', resolved), 'comment')
  }
  deleteComment(id: string): void {
    this.doc.transact(() => this.commentsMap.delete(id), 'comment')
  }
  setShowResolved(v: boolean): void {
    this.patch({ showResolved: v })
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
        draft: (state['draft'] as Shape | null) ?? null,
        page: String(state['page'] ?? DEFAULT_PAGE),
        view: (state['view'] as Collaborator['view']) ?? null,
        laser: (state['laser'] as Collaborator['laser']) ?? null
      })
    })
    this.patch({ collaborators: list })
    // 追従中なら相手の視点に合わせる
    const f = this.snapshot.following
    if (f !== null) {
      const c = list.find((x) => x.clientId === f)
      if (!c) this.patch({ following: null })
      else if (c.view) {
        if (c.page !== this.snapshot.currentPage) this.setPage(c.page)
        this.applyView(c.view)
      }
    }
  }

  /** 相手の表示範囲を自分の画面に収める(縦横比が違っても全体が入るように) */
  private applyView(v: NonNullable<Collaborator['view']>): void {
    const { w, h } = this.viewport
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(w / (v.w / v.scale), h / (v.h / v.scale))))
    const cx = (v.w / 2 - v.x) / v.scale
    const cy = (v.h / 2 - v.y) / v.scale
    this.snapshot = { ...this.snapshot, camera: { scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale } }
    this.patch({})
  }
  follow(clientId: number | null): void {
    this.patch({ following: clientId })
    if (clientId !== null) {
      const c = this.snapshot.collaborators.find((x) => x.clientId === clientId)
      if (c?.view) {
        if (c.page !== this.snapshot.currentPage) this.setPage(c.page)
        this.applyView(c.view)
      }
    }
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
    const explicitZ = (init as { z?: number }).z
    const shape = {
      ...defaultsFor(init.type),
      page: this.snapshot.currentPage,
      ...init,
      id: (init as { id?: string }).id ?? newId(),
      x: init.x ?? 0,
      y: init.y ?? 0,
      z: explicitZ ?? (init.type === 'frame' ? (this.snapshot.shapes.length ? this.snapshot.shapes[0]!.z - 1 : 0) : this.nextZ()),
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
        const locked = m.get('locked') === true && patch.locked !== false
        let changed = false
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'id' || k === 'type') continue
          // ロック中は位置・大きさを変えない(内容の編集は可)
          if (locked && ['x', 'y', 'w', 'h', 'rotation', 'dx', 'dy', 'points'].includes(k)) continue
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
    ids = ids.filter((id) => !this.snapshot.byId.get(id)?.locked)
    if (ids.length === 0) return
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
  sendToBack(ids: string[]): void {
    const min = this.snapshot.shapes.length ? this.snapshot.shapes[0]!.z : 0
    let z = min - ids.length
    this.updateShapes(ids.map((id) => ({ id, patch: { z: z++ } })))
  }
  /** 一段だけ前(後ろ)へ: 隣の図形と z を入れ替える */
  bringForward(ids: string[]): void {
    this.stepZ(ids, 1)
  }
  sendBackward(ids: string[]): void {
    this.stepZ(ids, -1)
  }
  private stepZ(ids: string[], dir: 1 | -1): void {
    const order = this.snapshot.shapes.map((s) => s.id)
    const set = new Set(ids)
    const next = [...order]
    if (dir === 1) {
      for (let i = next.length - 2; i >= 0; i--) if (set.has(next[i]!) && !set.has(next[i + 1]!)) [next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
    } else {
      for (let i = 1; i < next.length; i++) if (set.has(next[i]!) && !set.has(next[i - 1]!)) [next[i], next[i - 1]] = [next[i - 1]!, next[i]!]
    }
    if (next.every((id, i) => id === order[i])) return
    this.updateShapes(next.map((id, i) => ({ id, patch: { z: i + 1 } })))
  }

  /** 矢印キーなどでの微調整 */
  nudge(ids: string[], dx: number, dy: number): void {
    this.updateShapes(ids.map((id) => ({ id, patch: { x: this.snapshot.byId.get(id)!.x + dx, y: this.snapshot.byId.get(id)!.y + dy } })))
  }

  /** 整列(2 つ以上)。基準は選択全体の外接枠 */
  align(ids: string[], how: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): void {
    const shapes = ids.map((id) => this.snapshot.byId.get(id)!).filter(Boolean)
    const all = boundsOf(shapes)
    if (!all || shapes.length < 2) return
    this.updateShapes(
      shapes.map((s) => {
        const b = shapeBounds(s)
        const patch: Partial<Shape> = {}
        if (how === 'left') patch.x = s.x + (all.x - b.x)
        if (how === 'right') patch.x = s.x + (all.x + all.w - (b.x + b.w))
        if (how === 'centerX') patch.x = s.x + (all.x + all.w / 2 - (b.x + b.w / 2))
        if (how === 'top') patch.y = s.y + (all.y - b.y)
        if (how === 'bottom') patch.y = s.y + (all.y + all.h - (b.y + b.h))
        if (how === 'centerY') patch.y = s.y + (all.y + all.h / 2 - (b.y + b.h / 2))
        return { id: s.id, patch }
      })
    )
  }
  /** 等間隔に並べる(3 つ以上) */
  distribute(ids: string[], axis: 'x' | 'y'): void {
    const shapes = ids.map((id) => this.snapshot.byId.get(id)!).filter(Boolean)
    if (shapes.length < 3) return
    const items = shapes.map((s) => ({ s, b: shapeBounds(s) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y))
    const first = items[0]!.b
    const last = items[items.length - 1]!.b
    const total = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y
    const sizes = items.reduce((acc, it) => acc + (axis === 'x' ? it.b.w : it.b.h), 0)
    const gap = (total - sizes) / (items.length - 1)
    let pos = axis === 'x' ? first.x : first.y
    this.updateShapes(
      items.map(({ s, b }) => {
        const patch: Partial<Shape> = axis === 'x' ? { x: s.x + (pos - b.x) } : { y: s.y + (pos - b.y) }
        pos += (axis === 'x' ? b.w : b.h) + gap
        return { id: s.id, patch }
      })
    )
  }

  // ---- クリップボード ------------------------------------------------------
  private memClipboard: Shape[] = []
  /** 選択中の図形をクリップボードへ(テキストとしても書くので、別ボードのタブへも貼れる) */
  async copy(ids: string[] = this.snapshot.selection): Promise<number> {
    const shapes = ids.map((id) => this.snapshot.byId.get(id)!).filter(Boolean)
    if (shapes.length === 0) return 0
    this.memClipboard = shapes
    try {
      await navigator.clipboard?.writeText(JSON.stringify({ mark: CLIPBOARD_MARK, shapes }))
    } catch {
      /* クリップボード権限が無い場合はメモリだけ */
    }
    return shapes.length
  }
  async cut(ids: string[] = this.snapshot.selection): Promise<number> {
    const n = await this.copy(ids)
    if (n) this.deleteShapes(ids.filter((id) => !this.snapshot.byId.get(id)?.locked))
    return n
  }
  /** クリップボードの図形を貼り付ける(位置は少しずらす、または指定位置の中心へ) */
  async paste(at?: Point, text?: string): Promise<string[]> {
    if (this.snapshot.readonly) return []
    let shapes: Shape[] = this.memClipboard
    // 明示的にテキストが渡された(paste イベント)場合はそれを、無ければメモリを優先。
    // システムのクリップボード読み取りは権限待ちで固まることがあるので 500ms で打ち切る
    let raw = text ?? ''
    if (!raw && shapes.length === 0 && navigator.clipboard?.readText) {
      raw = await Promise.race([
        navigator.clipboard.readText().catch(() => ''),
        new Promise<string>((r) => setTimeout(() => r(''), 500))
      ])
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { mark?: string; shapes?: Shape[] }
        if (parsed.mark === CLIPBOARD_MARK && Array.isArray(parsed.shapes)) shapes = parsed.shapes
      } catch {
        /* 図形以外のテキスト */
      }
    }
    if (shapes.length === 0) return []
    const all = boundsOf(shapes)!
    const off = at ? { x: at.x - (all.x + all.w / 2), y: at.y - (all.y + all.h / 2) } : { x: 24, y: 24 }
    const created: string[] = []
    for (const copy of remapShapes(shapes, off, { resetCards: true, exists: (id) => this.snapshot.byId.has(id) })) {
      this.createShape(copy as Parameters<typeof this.createShape>[0])
      created.push(copy.id)
    }
    this.select(created)
    return created
  }

  /** 図形の組(雛形・貼り付け以外)を現在のページに入れる。frame は背面、それ以外は前面へ。返り値は作成した id */
  insertShapes(list: Array<Partial<Shape> & { type: ShapeType }>, at: Point): string[] {
    if (this.snapshot.readonly || list.length === 0) return []
    const full = list.map((s) => ({ ...defaultsFor(s.type), ...s, id: s.id ?? newId() }) as Shape)
    const bounds = boundsOf(full)!
    const off = { x: at.x - (bounds.x + bounds.w / 2), y: at.y - (bounds.y + bounds.h / 2) }
    const created: string[] = []
    // 区画は背面へ(既存の最背面よりさらに後ろ)、それ以外は前面へ
    const frames = full.filter((s) => s.type === 'frame')
    const others = full.filter((s) => s.type !== 'frame')
    const minZ = this.snapshot.shapes.length ? this.snapshot.shapes[0]!.z : 0
    let backZ = minZ - frames.length
    for (const copy of remapShapes([...frames, ...others], off, { resetCards: false, exists: () => false })) {
      if (copy.type === 'frame') (copy as Shape & { z: number }).z = backZ++
      this.createShape(copy as Parameters<typeof this.createShape>[0])
      created.push(copy.id)
    }
    // 吸着矢印の端点を確定
    const arrows = created.map((id) => this.snapshot.byId.get(id)).filter((x): x is ArrowShape => !!x && x.type === 'arrow' && !!(x.startBind || x.endBind))
    if (arrows.length) this.updateShapes(arrows.map((a) => ({ id: a.id, patch: resolveArrow(a, (id) => this.snapshot.byId.get(id)) })))
    this.select(created)
    return created
  }

  /** 文字を含む図形を検索(文字・付箋・ラベル・依頼カード) */
  find(query: string): Shape[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return this.snapshot.allShapes.filter((s) => shapeTexts(s).some((t) => t && t.toLowerCase().includes(q)))
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
    const base = (Array.isArray(ids) ? ids : [ids]).filter((id) => this.snapshot.byId.has(id))
    // グループの一員を選ぶとグループ全体が選ばれる
    const groups = new Set(base.map((id) => this.snapshot.byId.get(id)!.groupId).filter((g): g is string => !!g))
    const list = [...new Set([...base, ...this.snapshot.shapes.filter((s) => s.groupId && groups.has(s.groupId)).map((s) => s.id)])]
    this.patch({ selection: list })
    this.provider.awareness.setLocalStateField('selection', list)
  }
  /** 選択中の図形をグループにする(2 つ以上) */
  groupSelection(): void {
    const ids = this.snapshot.selection
    if (ids.length < 2 || this.snapshot.readonly) return
    const groupId = newGroupId()
    this.updateShapes(ids.map((id) => ({ id, patch: { groupId } })))
  }
  ungroupSelection(): void {
    const ids = this.snapshot.selection.filter((id) => this.snapshot.byId.get(id)?.groupId)
    if (ids.length === 0 || this.snapshot.readonly) return
    this.updateShapes(ids.map((id) => ({ id, patch: { groupId: null } })))
  }
  setLocked(ids: string[], locked: boolean): void {
    if (this.snapshot.readonly || ids.length === 0) return
    this.updateShapes(ids.map((id) => ({ id, patch: { locked } })))
  }
  selectNone(): void {
    this.select([])
  }

  // ---- ツール・スタイル ------------------------------------------------
  setTool(tool: ToolId): void {
    if (this.snapshot.readonly && tool !== 'select' && tool !== 'hand' && tool !== 'laser') return
    this.patch({ tool, editingId: null, editingCell: null })
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
        if (s.type === 'text' || s.type === 'note') {
          for (const k of ['fontSize', 'bold', 'italic', 'underline', 'align'] as const) {
            if (p[k] !== undefined) (patch as Record<string, unknown>)[k] = p[k]
          }
        }
        if (p.dash !== undefined && (s.type === 'arrow' || s.type === 'rect' || s.type === 'ellipse')) (patch as { dash: LineDash }).dash = p.dash
        if (p.geoKind !== undefined && s.type === 'rect') (patch as { kind: GeoKind }).kind = p.geoKind
        if (p.fontSize !== undefined && (s.type === 'rect' || s.type === 'ellipse')) (patch as { fontSize: number }).fontSize = p.fontSize
        return { id: s.id, patch }
      })
    )
  }
  setEditing(id: string | null, cell: { r: number; c: number } | null = null): void {
    this.patch({ editingId: id, editingCell: id ? cell : null })
  }
  setCropping(id: string | null): void {
    this.patch({ cropping: id })
  }

  // ---- 表 ----------------------------------------------------------------
  setCell(id: string, r: number, c: number, text: string): void {
    const t = this.snapshot.byId.get(id)
    if (!t || t.type !== 'table') return
    const cells = t.cells.map((row) => [...row])
    if (!cells[r] || cells[r]![c] === undefined) return
    cells[r]![c] = text
    this.updateShape<TableShape>(id, { cells })
  }
  tableInsertRow(id: string, at?: number): void {
    const t = this.snapshot.byId.get(id)
    if (!t || t.type !== 'table') return
    const i = at ?? t.cells.length
    const cells = [...t.cells]
    cells.splice(i, 0, new Array(t.colWidths.length).fill(''))
    const rowHeights = [...t.rowHeights]
    rowHeights.splice(i, 0, t.rowHeights[t.rowHeights.length - 1] ?? 40)
    this.updateShape<TableShape>(id, { cells, rowHeights, ...tableSize({ colWidths: t.colWidths, rowHeights }) })
  }
  tableDeleteRow(id: string, at?: number): void {
    const t = this.snapshot.byId.get(id)
    if (!t || t.type !== 'table' || t.cells.length <= 1) return
    const i = at ?? t.cells.length - 1
    const cells = t.cells.filter((_, r) => r !== i)
    const rowHeights = t.rowHeights.filter((_, r) => r !== i)
    this.updateShape<TableShape>(id, { cells, rowHeights, ...tableSize({ colWidths: t.colWidths, rowHeights }) })
  }
  tableInsertCol(id: string, at?: number): void {
    const t = this.snapshot.byId.get(id)
    if (!t || t.type !== 'table') return
    const i = at ?? t.colWidths.length
    const cells = t.cells.map((row) => {
      const r = [...row]
      r.splice(i, 0, '')
      return r
    })
    const colWidths = [...t.colWidths]
    colWidths.splice(i, 0, t.colWidths[t.colWidths.length - 1] ?? 120)
    this.updateShape<TableShape>(id, { cells, colWidths, ...tableSize({ colWidths, rowHeights: t.rowHeights }) })
  }
  tableDeleteCol(id: string, at?: number): void {
    const t = this.snapshot.byId.get(id)
    if (!t || t.type !== 'table' || t.colWidths.length <= 1) return
    const i = at ?? t.colWidths.length - 1
    const cells = t.cells.map((row) => row.filter((_, c) => c !== i))
    const colWidths = t.colWidths.filter((_, c) => c !== i)
    this.updateShape<TableShape>(id, { cells, colWidths, ...tableSize({ colWidths, rowHeights: t.rowHeights }) })
  }

  // ---- 画像のトリミング --------------------------------------------------
  /** 表示上の矩形(ページ座標)で切り抜く。natural は元画像のピクセル寸法 */
  cropImage(id: string, rect: { x: number; y: number; w: number; h: number }, natural: { w: number; h: number }): void {
    const img = this.snapshot.byId.get(id)
    if (!img || img.type !== 'image') return
    const cur = img.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h }
    const rx = Math.max(0, Math.min(1, (rect.x - img.x) / img.w))
    const ry = Math.max(0, Math.min(1, (rect.y - img.y) / img.h))
    const rw = Math.max(0.02, Math.min(1 - rx, rect.w / img.w))
    const rh = Math.max(0.02, Math.min(1 - ry, rect.h / img.h))
    const crop = { x: Math.round(cur.x + cur.w * rx), y: Math.round(cur.y + cur.h * ry), w: Math.round(cur.w * rw), h: Math.round(cur.h * rh) }
    this.updateShape<ImageShape>(id, { crop, x: img.x + img.w * rx, y: img.y + img.h * ry, w: img.w * rw, h: img.h * rh })
    this.patch({ cropping: null })
  }
  uncropImage(id: string, natural: { w: number; h: number }): void {
    const img = this.snapshot.byId.get(id)
    if (!img || img.type !== 'image' || !img.crop) return
    // 表示倍率を保ったまま全体に戻す
    const k = img.w / img.crop.w
    this.updateShape<ImageShape>(id, { crop: null, x: img.x - img.crop.x * k, y: img.y - img.crop.y * k, w: natural.w * k, h: natural.h * k })
  }

  // ---- レーザーポインター ----------------------------------------------------
  private laserPts: number[] = []
  private laserTimer: number | null = null
  laserMove(p: Point | null): void {
    if (!p) {
      this.laserPts = []
      this.provider.awareness.setLocalStateField('laser', null)
      return
    }
    this.laserPts.push(p.x, p.y)
    if (this.laserPts.length > 60) this.laserPts.splice(0, this.laserPts.length - 60)
    if (this.laserTimer !== null) return
    this.laserTimer = window.setTimeout(() => {
      this.laserTimer = null
      this.provider.awareness.setLocalStateField('laser', { points: [...this.laserPts], ts: Date.now() })
    }, 30)
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
    this.publishView()
  }
  getViewport(): { w: number; h: number } {
    return this.viewport
  }
  setCamera(c: Partial<Camera>, opts: { keepFollow?: boolean } = {}): void {
    const camera = { ...this.snapshot.camera, ...c }
    camera.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camera.scale))
    this.patch({ camera, following: opts.keepFollow ? this.snapshot.following : null })
    this.publishView()
  }
  private viewTimer: number | null = null
  private publishView(): void {
    if (this.viewTimer !== null) return
    this.viewTimer = window.setTimeout(() => {
      this.viewTimer = null
      const c = this.snapshot.camera
      this.provider.awareness.setLocalStateField('view', { x: c.x, y: c.y, scale: c.scale, w: this.viewport.w, h: this.viewport.h })
    }, 80)
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
    const b = boundsOf(this.snapshot.shapes.filter((s) => !(s.type === 'request-card' && s.archived)))
    // 左のツールバー・右のパネル分を余白に含める
    if (b) this.zoomToBounds(b, 140)
  }
  zoomTo(id: string): void {
    const s = this.snapshot.byId.get(id)
    if (!s) return
    if (s.page !== this.snapshot.currentPage) this.setPage(s.page)
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
      if (exclude.includes(s.id) || s.type === 'arrow' || s.type === 'draw' || s.type === 'frame') continue
      if (s.type === 'request-card' && s.archived) continue
      const b = shapeBounds(s)
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return s
    }
    return null
  }
}
