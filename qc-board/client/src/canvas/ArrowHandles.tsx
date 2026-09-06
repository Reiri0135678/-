import type { JSX } from 'react'
import { Circle } from 'react-konva'
import type { ArrowShape } from '@shared/shapes'
import type { BoardEditor } from './editor'
import type { Point } from './types'
import { bindingFor, resolveArrow } from './geometry'

/** 矢印の端点ハンドル。ドラッグで端点を動かし、図形の上で離すと吸着する */
export function ArrowHandles({ editor, arrow, scale, onTarget }: { editor: BoardEditor; arrow: ArrowShape; scale: number; onTarget: (id: string | null) => void }): JSX.Element {
  const r = 7 / scale
  const start = { x: arrow.x, y: arrow.y }
  const end = { x: arrow.x + arrow.dx, y: arrow.y + arrow.dy }
  const move = (which: 'start' | 'end', p: Point, commit: boolean) => {
    const target = editor.shapeAt(p, [arrow.id])
    onTarget(commit ? null : (target?.id ?? null))
    const cur = editor.getShape<ArrowShape>(arrow.id)
    if (!cur) return
    const next: ArrowShape = { ...cur }
    if (which === 'start') {
      next.startBind = target ? bindingFor(target, p) : null
      if (!target) {
        next.dx = cur.x + cur.dx - p.x
        next.dy = cur.y + cur.dy - p.y
        next.x = p.x
        next.y = p.y
      }
    } else {
      next.endBind = target ? bindingFor(target, p) : null
      if (!target) {
        next.dx = p.x - cur.x
        next.dy = p.y - cur.y
      }
    }
    const pos = resolveArrow(next, (id) => editor.getShape(id))
    editor.updateShape<ArrowShape>(arrow.id, { ...pos, startBind: next.startBind, endBind: next.endBind })
  }
  const handle = (which: 'start' | 'end', p: Point) => (
    <Circle
      key={which}
      x={p.x}
      y={p.y}
      radius={r}
      fill="#fffefb"
      stroke="#d97757"
      strokeWidth={2 / scale}
      draggable
      shapeId={arrow.id}
      data-handle={which}
      onDragMove={(e) => move(which, { x: e.target.x(), y: e.target.y() }, false)}
      onDragEnd={(e) => {
        move(which, { x: e.target.x(), y: e.target.y() }, true)
        // 位置は図形データから描き直すのでノード位置は戻す
        e.target.position(which === 'start' ? { x: arrow.x, y: arrow.y } : { x: arrow.x + arrow.dx, y: arrow.y + arrow.dy })
      }}
      onPointerDown={(e) => {
        e.cancelBubble = true
      }}
    />
  )
  return (
    <>
      {handle('start', start)}
      {handle('end', end)}
    </>
  )
}
