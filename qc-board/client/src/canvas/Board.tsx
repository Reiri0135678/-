import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { defaultsFor, shapesInFrame, tableSize, todayString, type ArrowShape, type DrawShape, type FrameShape, type ImageShape, type Shape, type TableShape } from '@shared/shapes'
import { BoardEditor, newId } from './editor'
import type { Point } from './types'
import { bindingFor, resolveArrow, shapeBounds, snapTo } from './geometry'
import { CREATE_TOOLS, drawFromPoints, drawStyle, makeDraft, templateShapesFrom } from './tools'
import { EditorContext, useEditorSnapshot } from './hooks'
import { ShapeView, shapeIdOf, type ShapeHandlers } from './shapes/ShapeView'
import { ArrowHandles } from './ArrowHandles'
import { Cursors } from './Cursors'
import { QcToolbar } from './QcToolbar'
import { StylePanel } from './StylePanel'
import { ZoomBar } from './ZoomBar'
import { TextEditor } from './TextEditor'
import { PageBar } from './PageBar'
import { CommentPins, CommentPopover, type CommentPopoverState } from './Comments'
import { ContextMenu, type MenuState } from './ContextMenu'
import { FindBar } from './FindBar'
import { Minimap } from './Minimap'
import { LaserTrails } from './Laser'
import { CropOverlay } from './CropOverlay'
import { exportPng } from './exportPng'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useImageImport } from './useImageImport'
import { usePinchZoom } from './usePinchZoom'
import { saveTemplate } from '../api'

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

/** ドラッグ中の操作。ポインタを離すまで保持する */
type Gesture =
  | { kind: 'draw'; points: number[] }
  | { kind: 'create'; start: Point; id: string }
  | { kind: 'marquee'; start: Point; additive: boolean }
  | { kind: 'erase' }
  | { kind: 'laser' }

/** Konva ステージと周辺 UI。ポインタ操作を図形の作成・選択・移動に変換する */
function Canvas({ editor, demo, onStatus, onPeers }: BoardProps & { editor: BoardEditor }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [draft, setDraft] = useState<Shape | null>(null)
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [bindTarget, setBindTarget] = useState<string | null>(null)
  const [commentPop, setCommentPop] = useState<CommentPopoverState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [laser, setLaser] = useState<number[]>([])
  const [findOpen, setFindOpen] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const dragStart = useRef<Map<string, Point> | null>(null)
  const demoSeeded = useRef(false)

  const openFind = useCallback(() => setFindOpen(true), [])
  const spaceDown = useKeyboardShortcuts(editor, openFind)
  const { onDrop } = useImageImport(editor, containerRef, size)
  const touch = usePinchZoom(editor, containerRef, () => {
    gesture.current = null
    setDraft(null)
  })

  // ---- 描画途中の図形を相手にも見せる -----------------------------------------
  useEffect(() => {
    editor.setDraft(draft)
  }, [draft, editor])

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
    const single = snap.selection.length === 1 ? snap.byId.get(snap.selection[0]!) : undefined
    const nodes = snap.selection
      .filter((id) => !snap.byId.get(id)?.locked)
      .map((id) => layer.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n)
    // 矢印 1 本の選択時は端点ハンドルで操作する(Transformer は出さない)
    tr.nodes(snap.tool === 'select' && !snap.readonly && single?.type !== 'arrow' ? nodes : [])
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
        if (shape.type === 'table') {
          const node = e.target as Konva.Node
          const r = node.getAttr('cellR') as number | undefined
          const c = node.getAttr('cellC') as number | undefined
          editor.select(shape.id)
          editor.setEditing(shape.id, { r: r ?? 0, c: c ?? 0 })
          return
        }
        if (shape.type === 'text' || shape.type === 'note' || shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'frame') {
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
          // 区画を動かすときは中の図形も一緒に
          if (s?.type === 'frame') {
            for (const inner of shapesInFrame(s as FrameShape, editor.getShapes())) {
              if (!inner.locked && !m.has(inner.id)) m.set(inner.id, { x: inner.x, y: inner.y })
            }
          }
        }
        dragStart.current = m
      },
      onDragMove(shape, e) {
        const start = dragStart.current
        if (!start) return
        const s0 = start.get(shape.id)
        if (!s0) return
        const node = e.target
        let dx = node.x() - s0.x
        let dy = node.y() - s0.y
        // スナップ: 他の図形の端・中心に揃える(画面上 8px 以内)
        if (!e.evt.altKey) {
          const cur = editor.getShape(shape.id)
          if (cur) {
            const moving = shapeBounds({ ...cur, x: s0.x + dx, y: s0.y + dy } as Shape)
            const snapR = snapTo(moving, editor.getShapes().filter((o) => !start.has(o.id) && !(o.type === 'request-card' && o.archived)), 8 / editor.getSnapshot().camera.scale)
            dx += snapR.dx
            dy += snapR.dy
            node.x(s0.x + dx)
            node.y(s0.y + dy)
            setGuides(snapR.guides)
          }
        } else setGuides({ x: [], y: [] })
        editor.updateShapes([...start].map(([id, p]) => ({ id, patch: { x: p.x + dx, y: p.y + dy } })))
      },
      onDragEnd(shape, e) {
        const start = dragStart.current
        dragStart.current = null
        setGuides({ x: [], y: [] })
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
        } else if (cur.type === 'table') {
          const colWidths = cur.colWidths.map((w) => Math.max(24, w * sx))
          const rowHeights = cur.rowHeights.map((h) => Math.max(16, h * sy))
          Object.assign(patch, { colWidths, rowHeights, ...tableSize({ colWidths, rowHeights }) })
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
    if (commentPop) setCommentPop(null)
    const onEmpty = e.target === stage
    const p = pointerPage()
    if (!p) return
    if (snap.tool === 'comment') {
      if (snap.readonly) return
      const target = editor.shapeAt(p)
      setCommentPop({ at: p, shapeId: target?.id ?? null })
      editor.setTool('select')
      return
    }
    if (e.evt.button === 1 || spaceDown || snap.tool === 'hand') return // ステージのドラッグ(パン)に任せる
    if (snap.tool === 'laser') {
      gesture.current = { kind: 'laser' }
      setLaser([p.x, p.y])
      editor.laserMove(p)
      return
    }
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
      setDraft({ ...d, id: 'draft', x: 0, y: 0, z: 0, by: '', updatedAt: 0, points: [p.x, p.y], ...drawStyle(tool, snap.style) })
      return
    }
    if (tool === 'eraser') {
      gesture.current = { kind: 'erase' }
      eraseAt(stage)
      return
    }
    if (tool === 'table') {
      const s = editor.createShape<TableShape>({ type: 'table', x: p.x, y: p.y, color: snap.style.color })
      editor.select(s.id)
      editor.setTool('select')
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
      setDraft(makeDraft(tool, snap.style, p, p, id))
    }
  }


  const onPointerMove = () => {
    const stage = stageRef.current
    const p = pointerPage()
    if (!stage || !p || touch.pinching.current) return
    editor.setCursor(p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'draw') {
      g.points.push(p.x, p.y)
      setDraft((d) => (d && d.type === 'draw' ? { ...d, points: [...g.points] } : d))
    } else if (g.kind === 'create') {
      setDraft(makeDraft(snap.tool, snap.style, g.start, p, g.id))
    } else if (g.kind === 'marquee') {
      setMarquee({ a: g.start, b: p })
    } else if (g.kind === 'erase') {
      eraseAt(stage)
    } else if (g.kind === 'laser') {
      setLaser((pts) => [...pts.slice(-58), p.x, p.y])
      editor.laserMove(p)
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    const p = pointerPage()
    if (!g) return
    if (g.kind === 'laser') {
      window.setTimeout(() => {
        setLaser([])
        editor.laserMove(null)
      }, 600)
      return
    }
    if (g.kind === 'draw') {
      setDraft(null)
      commitDraw(g.points)
    } else if (g.kind === 'create') {
      setDraft(null)
      const end = p ?? g.start
      const tool = snap.tool
      const d = makeDraft(tool, snap.style, g.start, end, g.id)
      // ほぼクリックだけなら既定サイズで置く
      if (tool !== 'request-card' && Math.hypot(end.x - g.start.x, end.y - g.start.y) < 4) {
        if (tool === 'arrow' || tool === 'line') (d as { dx: number; dy: number }).dx = 120
        else {
          d.w = 120
          d.h = 80
        }
      }
      if (d.type === 'arrow') {
        // 端点が図形の上なら吸着させる
        const sShape = editor.shapeAt(g.start)
        const eShape = editor.shapeAt(end)
        const a = d as ArrowShape
        a.startBind = sShape ? bindingFor(sShape, g.start) : null
        a.endBind = eShape && eShape.id !== sShape?.id ? bindingFor(eShape, end) : null
        if (a.startBind || a.endBind) Object.assign(a, resolveArrow(a, (id) => editor.getShape(id)))
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
          .filter((s) => !s.locked)
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
    editor.createShape<DrawShape>({ type: 'draw', ...drawFromPoints(points), ...drawStyle(snap.tool, snap.style) })
  }

  const eraseAt = (stage: Konva.Stage) => {
    const pos = stage.getPointerPosition()
    if (!pos) return
    const node = stage.getIntersection(pos)
    const id = shapeIdOf(node)
    if (id && id !== 'draft' && !editor.getShape(id)?.locked) editor.deleteShapes([id])
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

  const doExport = (scope: 'page' | 'selection') => {
    const layer = layerRef.current
    if (!layer) return Promise.resolve()
    const shapes = scope === 'selection' ? editor.getSelectedShapes() : snap.shapes.filter((s) => !(s.type === 'request-card' && s.archived))
    return exportPng(editor, layer, shapes, size, scope === 'selection' ? '選択範囲' : 'ボード')
  }
  ;(window as unknown as { __qcExport?: typeof doExport }).__qcExport = doExport

  const onSaveTemplate = () => {
    const sel = editor.getSelectedShapes()
    if (!sel.length) return
    const name = window.prompt('雛形の名前', '')
    if (!name) return
    saveTemplate(name, templateShapesFrom(sel))
      .then(() => window.dispatchEvent(new CustomEvent('qc-templates-changed')))
      .catch((e) => window.alert(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`))
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = containerRef.current
    const stage = stageRef.current
    if (!el || !stage) return
    const r = el.getBoundingClientRect()
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top }
    const page = editor.screenToPage(screen)
    const id = shapeIdOf(stage.getIntersection(screen))
    if (id && id !== 'draft' && !editor.getSnapshot().selection.includes(id)) editor.select(id)
    setMenu({ screen: { x: e.clientX, y: e.clientY }, page, shapeId: id && id !== 'draft' ? id : null })
  }

  const panning = snap.tool === 'hand' || spaceDown
  const cursor = panning ? 'grab' : snap.tool === 'select' ? 'default' : snap.tool === 'eraser' ? 'cell' : snap.tool === 'comment' ? 'help' : snap.tool === 'laser' ? 'none' : 'crosshair'

  return (
    <div
      ref={containerRef}
      className="board"
      data-tool={snap.tool}
      style={{ cursor }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      onPointerDownCapture={touch.onPointerDown}
      onPointerMoveCapture={touch.onPointerMove}
      onPointerUpCapture={touch.onPointerUp}
      onPointerCancelCapture={touch.onPointerUp}
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
              <ShapeView key={s.id} shape={s} draggable={snap.tool === 'select' && !snap.readonly && !panning && !s.locked} handlers={handlers} />
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
        <Layer>
          <CommentPins editor={editor} onOpen={(id) => setCommentPop({ id })} />
          {snap.tool === 'select' && !snap.readonly && snap.selection.length === 1 && snap.byId.get(snap.selection[0]!)?.type === 'arrow' && (
            <ArrowHandles editor={editor} arrow={snap.byId.get(snap.selection[0]!) as ArrowShape} scale={snap.camera.scale} onTarget={setBindTarget} />
          )}
        </Layer>
        <Layer listening={false}>
          {guides.x.map((x) => (
            <Line key={`gx${x}`} points={[x, -1e5, x, 1e5]} stroke="#d97757" strokeWidth={1 / snap.camera.scale} dash={[6 / snap.camera.scale, 4 / snap.camera.scale]} />
          ))}
          {guides.y.map((y) => (
            <Line key={`gy${y}`} points={[-1e5, y, 1e5, y]} stroke="#d97757" strokeWidth={1 / snap.camera.scale} dash={[6 / snap.camera.scale, 4 / snap.camera.scale]} />
          ))}
          {bindTarget && snap.byId.get(bindTarget) && (() => {
            const b = shapeBounds(snap.byId.get(bindTarget)!)
            return <Rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} stroke="#6a9bcc" strokeWidth={2 / snap.camera.scale} dash={[4, 3]} cornerRadius={6} />
          })()}
          <Cursors collaborators={snap.collaborators.filter((c) => c.page === snap.currentPage)} scale={snap.camera.scale} byId={snap.byId} />
          <LaserTrails collaborators={snap.collaborators.filter((c) => c.page === snap.currentPage)} mine={laser} myColor={editor.userColor} scale={snap.camera.scale} />
        </Layer>
        {snap.cropping && snap.byId.get(snap.cropping)?.type === 'image' && (
          <Layer>
            <CropOverlay editor={editor} image={snap.byId.get(snap.cropping) as ImageShape} scale={snap.camera.scale} />
          </Layer>
        )}
      </Stage>
      {snap.editingId && <TextEditor editor={editor} shapeId={snap.editingId} />}
      {commentPop && <CommentPopover editor={editor} state={commentPop} onClose={() => setCommentPop(null)} />}
      {menu && (
        <ContextMenu
          editor={editor}
          state={menu}
          onClose={() => setMenu(null)}
          onExport={(scope) => void doExport(scope)}
          onComment={(at, shapeId) => setCommentPop({ at, shapeId })}
          onSaveTemplate={onSaveTemplate}
        />
      )}
      {findOpen && <FindBar editor={editor} onClose={() => setFindOpen(false)} />}
      {snap.following !== null && (
        <div className="follow-banner" data-testid="follow-banner">
          {snap.collaborators.find((c) => c.clientId === snap.following)?.name ?? ''} さんの画面に追従中
          <button className="link" onClick={() => editor.follow(null)}>
            解除
          </button>
        </div>
      )}
      <QcToolbar />
      <StylePanel />
      <PageBar />
      <Minimap editor={editor} />
      <ZoomBar />
      {snap.status !== 'online' && (
        <div className="board-banner" data-status={snap.status}>
          {snap.status === 'connecting' ? 'サーバーに接続中…' : 'サーバーとの接続が切れました。再接続を試みています'}
        </div>
      )}
    </div>
  )
}
