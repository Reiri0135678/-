import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Rect, Stage, Transformer } from 'react-konva'
import { CARD_H, CARD_W, HIGHLIGHT_COLOR, defaultsFor, todayString, type DrawShape, type Shape } from '@shared/shapes'
import { BoardEditor, newId, shapeBounds, type Point, type ToolId } from './editor'
import { EditorContext, useEditorSnapshot } from './hooks'
import { ShapeView, shapeIdOf, type ShapeHandlers } from './shapes/ShapeView'
import { Cursors } from './Cursors'
import { QcToolbar } from './QcToolbar'
import { StylePanel } from './StylePanel'
import { ZoomBar } from './ZoomBar'
import { TextEditor } from './TextEditor'
import { loadImageSize } from './useImage'
import { expandFiles } from './pdf'

export type BoardStatus = 'connecting' | 'online' | 'offline'

export interface BoardProps {
  roomId: string
  userName: string
  readonly: boolean
  demo?: boolean
  onStatus?: (s: BoardStatus) => void
  onPeers?: (n: number) => void
  /** マウント時に Editor を外側へ渡す(サイドバー等が購読するため) */
  onEditor?: (editor: BoardEditor | null) => void
}

/** キャンバス層の入口。エディタを生成し、Konva ステージと UI を束ねる */
export function Board(props: BoardProps): JSX.Element {
  const { roomId, userName, readonly, onEditor } = props
  const [editor, setEditor] = useState<BoardEditor | null>(null)

  useEffect(() => {
    const ed = new BoardEditor({ roomId, userName, readonly })
    ;(window as unknown as { __qcEditor?: BoardEditor }).__qcEditor = ed
    setEditor(ed)
    onEditor?.(ed)
    return () => {
      onEditor?.(null)
      ed.destroy()
      setEditor(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userName, readonly])

  if (!editor) return <div className="board-loading">接続中…</div>
  return (
    <EditorContext.Provider value={editor}>
      <Canvas editor={editor} {...props} />
    </EditorContext.Provider>
  )
}

const CREATE_TOOLS: ReadonlySet<ToolId> = new Set(['arrow', 'rect', 'ellipse', 'request-card'])
const KEY_TOOLS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  d: 'draw',
  g: 'highlight',
  e: 'eraser',
  t: 'text',
  n: 'note',
  a: 'arrow',
  r: 'rect',
  o: 'ellipse',
  c: 'request-card'
}

function Canvas({ editor, demo, onStatus, onPeers }: BoardProps & { editor: BoardEditor }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [draft, setDraft] = useState<Shape | null>(null)
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const gesture = useRef<
    | { kind: 'draw'; points: number[] }
    | { kind: 'create'; start: Point; id: string }
    | { kind: 'marquee'; start: Point; additive: boolean }
    | { kind: 'erase' }
    | null
  >(null)
  const dragStart = useRef<Map<string, Point> | null>(null)
  const demoSeeded = useRef(false)

  // ---- 外部通知 --------------------------------------------------------
  useEffect(() => onStatus?.(snap.status), [snap.status, onStatus])
  useEffect(() => onPeers?.(snap.collaborators.length), [snap.collaborators.length, onPeers])

  // ---- サイズ追従 ------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) })
      editor.setViewport(r.width, r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [editor])

  // ---- デモ投入 --------------------------------------------------------
  useEffect(() => {
    if (!demo || demoSeeded.current || snap.status !== 'online') return
    demoSeeded.current = true
    if (snap.shapes.length > 0) return
    editor.createShape({ type: 'request-card', x: 120, y: 80, partNo: 'A-1234', lot: 'L240905', qty: '50', status: '受付', requester: editor.userName, requestedAt: todayString() })
    editor.createShape({ type: 'request-card', x: 400, y: 80, dept: '製造2課', partNo: 'B-0077', lot: 'L240903', qty: '12', status: '検査中', requester: editor.userName, requestedAt: todayString() })
    editor.createShape({ type: 'note', x: 120, y: 260, text: '外径の寸法を重点確認' })
    setTimeout(() => editor.zoomToFit(), 0)
  }, [demo, snap.status, snap.shapes.length, editor])

  // ---- Transformer にノードを結び付ける -----------------------------------
  useEffect(() => {
    const tr = trRef.current
    const layer = layerRef.current
    if (!tr || !layer) return
    const nodes = snap.selection
      .map((id) => layer.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n)
    tr.nodes(snap.tool === 'select' && !snap.readonly ? nodes : [])
    tr.getLayer()?.batchDraw()
  }, [snap.selection, snap.tool, snap.readonly, snap.version])

  // ---- 座標変換 --------------------------------------------------------
  const pointerPage = useCallback((): Point | null => {
    const stage = stageRef.current
    const p = stage?.getPointerPosition()
    return p ? editor.screenToPage(p) : null
  }, [editor])

  // ---- 図形イベント ------------------------------------------------------
  const handlers = useMemo<ShapeHandlers>(
    () => ({
      onPointerDown(shape, e) {
        if (snap.tool !== 'select' || spaceDown) return
        e.cancelBubble = true
        const additive = e.evt.shiftKey
        const sel = editor.getSnapshot().selection
        if (additive) {
          editor.select(sel.includes(shape.id) ? sel.filter((x) => x !== shape.id) : [...sel, shape.id])
        } else if (!sel.includes(shape.id)) {
          editor.select(shape.id)
        }
      },
      onDblClick(shape, e) {
        if (snap.readonly) return
        e.cancelBubble = true
        if (shape.type === 'text' || shape.type === 'note') {
          editor.select(shape.id)
          editor.setEditing(shape.id)
        }
      },
      onDragStart(shape, e) {
        e.cancelBubble = true
        const sel = editor.getSnapshot().selection.includes(shape.id) ? editor.getSnapshot().selection : [shape.id]
        if (!editor.getSnapshot().selection.includes(shape.id)) editor.select(shape.id)
        const m = new Map<string, Point>()
        for (const id of sel) {
          const s = editor.getShape(id)
          if (s) m.set(id, { x: s.x, y: s.y })
        }
        dragStart.current = m
      },
      onDragMove(shape, e) {
        const start = dragStart.current
        if (!start) return
        const s0 = start.get(shape.id)
        if (!s0) return
        const node = e.target
        const dx = node.x() - s0.x
        const dy = node.y() - s0.y
        editor.updateShapes([...start].map(([id, p]) => ({ id, patch: { x: p.x + dx, y: p.y + dy } })))
      },
      onDragEnd(shape, e) {
        const start = dragStart.current
        dragStart.current = null
        const node = e.target
        if (!start) {
          editor.updateShape(shape.id, { x: node.x(), y: node.y() })
          return
        }
        const s0 = start.get(shape.id)!
        const dx = node.x() - s0.x
        const dy = node.y() - s0.y
        editor.updateShapes([...start].map(([id, p]) => ({ id, patch: { x: p.x + dx, y: p.y + dy } })))
      },
      onTransformEnd(shape, e) {
        const node = e.target
        const sx = node.scaleX()
        const sy = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        const patch: Partial<Shape> = { x: node.x(), y: node.y(), rotation: node.rotation() }
        const cur = editor.getShape(shape.id)
        if (!cur) return
        if (cur.type === 'draw') {
          ;(patch as Partial<DrawShape>).points = cur.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy))
          patch.w = cur.w * sx
          patch.h = cur.h * sy
        } else if (cur.type === 'arrow') {
          ;(patch as { dx: number; dy: number }).dx = cur.dx * sx
          ;(patch as { dx: number; dy: number }).dy = cur.dy * sy
        } else if (cur.type === 'text') {
          patch.w = Math.max(20, cur.w * sx)
          ;(patch as { fontSize: number }).fontSize = Math.max(8, cur.fontSize * sy)
        } else {
          patch.w = Math.max(4, cur.w * sx)
          patch.h = Math.max(4, cur.h * sy)
        }
        editor.updateShape(shape.id, patch)
      }
    }),
    [editor, snap.tool, snap.readonly, spaceDown]
  )

  // ---- ステージのポインタ操作 --------------------------------------------
  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    if (snap.editingId) editor.setEditing(null)
    const onEmpty = e.target === stage
    const p = pointerPage()
    if (!p) return
    if (e.evt.button === 1 || spaceDown || snap.tool === 'hand') return // ステージのドラッグ(パン)に任せる
    if (snap.readonly) {
      if (onEmpty) editor.selectNone()
      return
    }
    const tool = snap.tool
    if (tool === 'select') {
      if (onEmpty) {
        gesture.current = { kind: 'marquee', start: p, additive: e.evt.shiftKey }
        if (!e.evt.shiftKey) editor.selectNone()
      }
      return
    }
    if (tool === 'draw' || tool === 'highlight') {
      gesture.current = { kind: 'draw', points: [p.x, p.y] }
      const d = defaultsFor('draw') as Omit<DrawShape, 'id' | 'x' | 'y' | 'z' | 'by' | 'updatedAt'>
      setDraft({
        ...d,
        id: 'draft',
        x: 0,
        y: 0,
        z: 0,
        by: '',
        updatedAt: 0,
        points: [p.x, p.y],
        color: tool === 'highlight' ? HIGHLIGHT_COLOR : snap.style.color,
        size: tool === 'highlight' ? Math.max(snap.style.size, 4) : snap.style.size,
        opacity: tool === 'highlight' ? 0.45 : 1
      })
      return
    }
    if (tool === 'eraser') {
      gesture.current = { kind: 'erase' }
      eraseAt(stage)
      return
    }
    if (tool === 'text') {
      const s = editor.createShape({ type: 'text', x: p.x, y: p.y - 12, color: snap.style.color })
      editor.select(s.id)
      editor.setEditing(s.id)
      editor.setTool('select')
      return
    }
    if (tool === 'note') {
      const s = editor.createShape({ type: 'note', x: p.x - 90, y: p.y - 90, color: snap.style.noteColor })
      editor.select(s.id)
      editor.setEditing(s.id)
      editor.setTool('select')
      return
    }
    if (CREATE_TOOLS.has(tool)) {
      const id = newId()
      gesture.current = { kind: 'create', start: p, id }
      setDraft(makeDraft(tool, p, p, id))
    }
  }

  const makeDraft = (tool: ToolId, a: Point, b: Point, id: string): Shape => {
    const base = { id, z: 0, by: '', updatedAt: 0 }
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    const st = snap.style
    if (tool === 'arrow') return { ...defaultsFor('arrow'), ...base, x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y, color: st.color, size: st.size } as Shape
    if (tool === 'rect') return { ...defaultsFor('rect'), ...base, x, y, w, h, color: st.color, size: st.size, fill: st.fill } as Shape
    if (tool === 'ellipse') return { ...defaultsFor('ellipse'), ...base, x, y, w, h, color: st.color, size: st.size, fill: st.fill } as Shape
    return { ...defaultsFor('request-card'), ...base, x: a.x, y: a.y, w: Math.max(CARD_W, w), h: Math.max(CARD_H, h) } as Shape
  }

  const onPointerMove = () => {
    const stage = stageRef.current
    const p = pointerPage()
    if (!stage || !p || pinch.current) return
    editor.setCursor(p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'draw') {
      g.points.push(p.x, p.y)
      setDraft((d) => (d && d.type === 'draw' ? { ...d, points: [...g.points] } : d))
    } else if (g.kind === 'create') {
      setDraft(makeDraft(snap.tool, g.start, p, g.id))
    } else if (g.kind === 'marquee') {
      setMarquee({ a: g.start, b: p })
    } else if (g.kind === 'erase') {
      eraseAt(stage)
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    const p = pointerPage()
    if (!g) return
    if (g.kind === 'draw') {
      setDraft(null)
      commitDraw(g.points)
    } else if (g.kind === 'create') {
      setDraft(null)
      const end = p ?? g.start
      const tool = snap.tool
      const d = makeDraft(tool, g.start, end, g.id)
      // ほぼクリックだけなら既定サイズで置く
      if (tool !== 'request-card' && Math.hypot(end.x - g.start.x, end.y - g.start.y) < 4) {
        if (tool === 'arrow') (d as { dx: number; dy: number }).dx = 120
        else {
          d.w = 120
          d.h = 80
        }
      }
      const { id, z: _z, by: _b, updatedAt: _u, ...rest } = d
      void _z
      void _b
      void _u
      const created = editor.createShape({ ...rest, id } as Parameters<typeof editor.createShape>[0])
      editor.select(created.id)
      editor.setTool('select')
    } else if (g.kind === 'marquee') {
      if (marquee) {
        const x0 = Math.min(marquee.a.x, marquee.b.x)
        const y0 = Math.min(marquee.a.y, marquee.b.y)
        const x1 = Math.max(marquee.a.x, marquee.b.x)
        const y1 = Math.max(marquee.a.y, marquee.b.y)
        const hit = snap.shapes
          .filter((s) => {
            const b = shapeBounds(s)
            return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
          })
          .map((s) => s.id)
        editor.select(g.additive ? [...new Set([...snap.selection, ...hit])] : hit)
      }
      setMarquee(null)
    }
  }

  const commitDraw = (points: number[]) => {
    if (points.length < 4) {
      // 点打ち: 小さな点にする
      points = [...points, points[0]! + 0.5, points[1]! + 0.5]
    }
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < points.length; i += 2) {
      x0 = Math.min(x0, points[i]!)
      y0 = Math.min(y0, points[i + 1]!)
      x1 = Math.max(x1, points[i]!)
      y1 = Math.max(y1, points[i + 1]!)
    }
    const rel = points.map((v, i) => (i % 2 === 0 ? v - x0 : v - y0))
    const isHl = snap.tool === 'highlight'
    editor.createShape<DrawShape>({
      type: 'draw',
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      points: rel,
      color: isHl ? HIGHLIGHT_COLOR : snap.style.color,
      size: isHl ? Math.max(snap.style.size, 4) : snap.style.size,
      opacity: isHl ? 0.45 : 1
    })
  }

  const eraseAt = (stage: Konva.Stage) => {
    const pos = stage.getPointerPosition()
    if (!pos) return
    const node = stage.getIntersection(pos)
    const id = shapeIdOf(node)
    if (id && id !== 'draft') editor.deleteShapes([id])
  }

  // ---- ホイール: パン / Ctrl+ホイール: ズーム ---------------------------------
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const factor = Math.exp(-e.evt.deltaY * 0.0015)
      editor.zoomBy(factor, stage.getPointerPosition() ?? undefined)
    } else {
      const c = editor.getSnapshot().camera
      const dx = e.evt.shiftKey && e.evt.deltaX === 0 ? e.evt.deltaY : e.evt.deltaX
      const dy = e.evt.shiftKey && e.evt.deltaX === 0 ? 0 : e.evt.deltaY
      editor.setCamera({ x: c.x - dx, y: c.y - dy })
    }
  }

  // ---- キーボード ------------------------------------------------------
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = editor.getSnapshot()
      if (e.key === ' ') {
        setSpaceDown(true)
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redoOnce()
        else editor.undoOnce()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        editor.redoOnce()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (!s.readonly && s.selection.length) editor.select(editor.duplicate(s.selection))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        editor.select(s.shapes.map((x) => x.id))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!s.readonly && s.selection.length) editor.deleteShapes(s.selection)
        return
      }
      if (e.key === 'Escape') {
        editor.setEditing(null)
        editor.selectNone()
        editor.setTool('select')
        return
      }
      if (e.key === '=' || e.key === '+') return editor.zoomBy(1.2)
      if (e.key === '-') return editor.zoomBy(1 / 1.2)
      if (e.key === '0') return editor.zoomToFit()
      const tool = KEY_TOOLS[e.key.toLowerCase()]
      if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) editor.setTool(tool)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [editor])

  // ---- 画像のドロップ / 貼り付け ----------------------------------------------
  const addImageFile = useCallback(
    async (file: File, at: Point) => {
      if (editor.isReadonly() || !file.type.startsWith('image/')) return
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
      const id = `${newId()}${ext}`.replace(/[^A-Za-z0-9_.-]/g, '_')
      const r = await fetch(`/api/uploads/${id}`, { method: 'PUT', body: file })
      if (!r.ok) {
        console.error('upload failed', r.status)
        return
      }
      const src = `/api/uploads/${id}`
      let w = 400
      let h = 300
      try {
        const nat = await loadImageSize(src)
        const k = Math.min(1, 600 / Math.max(nat.w, nat.h))
        w = Math.round(nat.w * k)
        h = Math.round(nat.h * k)
      } catch {
        /* サイズ不明なら既定 */
      }
      const s = editor.createShape({ type: 'image', x: at.x - w / 2, y: at.y - h / 2, w, h, src, name: file.name })
      editor.select(s.id)
    },
    [editor]
  )

  const addFiles = useCallback(
    async (files: File[], at: Point) => {
      const imgs = await expandFiles(files)
      for (let i = 0; i < imgs.length; i++) await addImageFile(imgs[i]!, { x: at.x + i * 40, y: at.y + i * 40 })
    },
    [addImageFile]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const at = editor.screenToPage({ x: e.clientX - r.left, y: e.clientY - r.top })
    void addFiles(Array.from(e.dataTransfer.files), at)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
      if (files.length === 0) return
      e.preventDefault()
      const center = editor.screenToPage({ x: size.w / 2, y: size.h / 2 })
      void addFiles(files, center)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [editor, addFiles, size])

  // ---- タッチ: 2 本指でピンチズーム・パン ------------------------------------
  const touches = useRef(new Map<number, Point>())
  const pinch = useRef<{ dist: number; center: Point; camera: { x: number; y: number; scale: number } } | null>(null)
  const onTouchPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      const [p1, p2] = [...touches.current.values()]
      const el = containerRef.current!.getBoundingClientRect()
      pinch.current = {
        dist: Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y),
        center: { x: (p1!.x + p2!.x) / 2 - el.left, y: (p1!.y + p2!.y) / 2 - el.top },
        camera: { ...editor.getSnapshot().camera }
      }
      gesture.current = null
      setDraft(null)
    }
  }
  const onTouchPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pz = pinch.current
    if (!pz || touches.current.size < 2) return
    const [p1, p2] = [...touches.current.values()]
    const el = containerRef.current!.getBoundingClientRect()
    const dist = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y)
    const center = { x: (p1!.x + p2!.x) / 2 - el.left, y: (p1!.y + p2!.y) / 2 - el.top }
    const k = dist / Math.max(1, pz.dist)
    const scale = Math.min(8, Math.max(0.1, pz.camera.scale * k))
    // 開始時の中心が指す紙面上の点を、現在の中心に合わせる
    const pageAtStart = { x: (pz.center.x - pz.camera.x) / pz.camera.scale, y: (pz.center.y - pz.camera.y) / pz.camera.scale }
    editor.setCamera({ scale, x: center.x - pageAtStart.x * scale, y: center.y - pageAtStart.y * scale })
  }
  const onTouchPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) pinch.current = null
  }

  const panning = snap.tool === 'hand' || spaceDown
  const cursor = panning ? 'grab' : snap.tool === 'select' ? 'default' : snap.tool === 'eraser' ? 'cell' : 'crosshair'

  return (
    <div
      ref={containerRef}
      className="board"
      data-tool={snap.tool}
      style={{ cursor }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerDownCapture={onTouchPointerDown}
      onPointerMoveCapture={onTouchPointerMove}
      onPointerUpCapture={onTouchPointerUp}
      onPointerCancelCapture={onTouchPointerUp}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={snap.camera.x}
        y={snap.camera.y}
        scaleX={snap.camera.scale}
        scaleY={snap.camera.scale}
        draggable={panning}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) editor.setCamera({ x: e.target.x(), y: e.target.y() })
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => editor.setCursor(null)}
      >
        <Layer ref={layerRef}>
          {snap.shapes
            .filter((s) => !(s.type === 'request-card' && s.archived))
            .map((s) => (
              <ShapeView key={s.id} shape={s} draggable={snap.tool === 'select' && !snap.readonly && !panning} handlers={handlers} />
            ))}
          {draft && <ShapeView shape={draft} draft draggable={false} />}
          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={false}
            ignoreStroke
            anchorSize={8}
            borderStroke="#d97757"
            anchorStroke="#d97757"
            anchorFill="#fffefb"
            boundBoxFunc={(_old, box) => (box.width < 4 || box.height < 4 ? _old : box)}
          />
          {marquee && (
            <Rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="rgba(217,119,87,0.08)"
              stroke="#d97757"
              strokeWidth={1 / snap.camera.scale}
              listening={false}
            />
          )}
        </Layer>
        <Layer listening={false}>
          <Cursors collaborators={snap.collaborators} scale={snap.camera.scale} />
        </Layer>
      </Stage>
      {snap.editingId && <TextEditor editor={editor} shapeId={snap.editingId} />}
      <QcToolbar />
      <StylePanel />
      <ZoomBar />
      {snap.status !== 'online' && (
        <div className="board-banner" data-status={snap.status}>
          {snap.status === 'connecting' ? 'サーバーに接続中…' : 'サーバーとの接続が切れました。再接続を試みています'}
        </div>
      )}
    </div>
  )
}
