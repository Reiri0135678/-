import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { EllipseShape, FrameShape, NoteShape, RectShape, TableShape, TextShape } from '@shared/shapes'
import type { BoardEditor } from './editor'
import { useEditorSnapshot } from './hooks'

/** 文字・付箋の文字入力オーバーレイ(キャンバス上の位置に textarea を重ねる) */
export function TextEditor({ editor, shapeId }: { editor: BoardEditor; shapeId: string }): JSX.Element | null {
  const snap = useEditorSnapshot(editor)
  const shape = snap.byId.get(shapeId) as TextShape | NoteShape | RectShape | EllipseShape | FrameShape | TableShape | undefined
  const isLabel = shape?.type === 'rect' || shape?.type === 'ellipse'
  const isFrame = shape?.type === 'frame'
  const cell = snap.editingCell
  const isCell = shape?.type === 'table' && !!cell
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(shape ? (shape.type === 'rect' || shape.type === 'ellipse' ? shape.label : shape.type === 'frame' ? shape.title : shape.type === 'table' ? (shape.cells[cell?.r ?? 0]?.[cell?.c ?? 0] ?? '') : shape.text) : '')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [shapeId, cell?.r, cell?.c])
  useEffect(() => {
    if (shape && shape.type === 'text' && ref.current) {
      // 文字図形は高さを内容に合わせる
      const h = ref.current.scrollHeight / snap.camera.scale
      if (Math.abs(h - shape.h) > 2) editor.updateShape(shapeId, { h })
    }
  }, [value, shape, editor, shapeId, snap.camera.scale])

  if (!shape) return null
  if (shape.type === 'table' && !cell) return null

  const commit = () => {
    if (isCell) editor.setCell(shapeId, cell!.r, cell!.c, value)
    else if (isLabel) editor.updateShape(shapeId, { label: value } as Partial<RectShape>)
    else if (isFrame) editor.updateShape(shapeId, { title: value.trim() || '区画' } as Partial<FrameShape>)
    else editor.updateShape(shapeId, { text: value } as Partial<TextShape>)
    if (shape.type === 'text' && value.trim() === '') editor.deleteShapes([shapeId])
    editor.setEditing(null)
  }

  // 表のセルの位置と大きさ
  let cellBox = { x: 0, y: 0, w: 0, h: 0 }
  if (isCell && shape.type === 'table') {
    const cx = shape.colWidths.slice(0, cell!.c).reduce((a, b) => a + b, 0)
    const cy = shape.rowHeights.slice(0, cell!.r).reduce((a, b) => a + b, 0)
    cellBox = { x: cx, y: cy, w: shape.colWidths[cell!.c] ?? 100, h: shape.rowHeights[cell!.r] ?? 40 }
  }
  const pos = editor.pageToScreen({ x: shape.x + (isCell ? cellBox.x : 0), y: isFrame ? shape.y - 30 : shape.y + (isCell ? cellBox.y : 0) })
  const k = snap.camera.scale
  const isNote = shape.type === 'note'
  const pad = isNote ? 12 * k : isLabel ? 8 * k : isCell ? 4 * k : 0
  const styled = shape.type === 'text' || shape.type === 'note' ? shape : { bold: isFrame || (isCell && shape.type === 'table' && shape.headerRow && cell!.r === 0), italic: false, underline: false, align: isFrame || isCell ? ('left' as const) : ('center' as const), fontSize: isFrame ? 13 : shape.fontSize, color: shape.color }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      data-testid="text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Enter' && !e.shiftKey && !isNote && !isLabel) {
          e.preventDefault()
          commit()
        } else if (e.key === 'Tab' && isCell && shape.type === 'table') {
          e.preventDefault()
          editor.setCell(shapeId, cell!.r, cell!.c, value)
          const cols = shape.colWidths.length
          const rows = shape.rowHeights.length
          let idx = cell!.r * cols + cell!.c + (e.shiftKey ? -1 : 1)
          idx = ((idx % (rows * cols)) + rows * cols) % (rows * cols)
          const next = { r: Math.floor(idx / cols), c: idx % cols }
          // 次のセルの文字に差し替えてから移動する(移動後の effect が全選択する)
          setValue(shape.cells[next.r]?.[next.c] ?? '')
          editor.setEditing(shapeId, next)
        }
        e.stopPropagation()
      }}
      style={{
        left: pos.x + pad,
        top: pos.y + pad,
        width: (isFrame ? 240 : isCell ? cellBox.w - 8 : shape.w - (isNote ? 24 : isLabel ? 16 : 0)) * k,
        height: (isFrame ? 24 : isCell ? cellBox.h - 8 : shape.h - (isNote ? 24 : isLabel ? 16 : 0)) * k,
        fontSize: styled.fontSize * k,
        fontWeight: styled.bold ? 700 : 400,
        fontStyle: styled.italic ? 'italic' : 'normal',
        textDecoration: styled.underline ? 'underline' : 'none',
        textAlign: styled.align,
        lineHeight: isNote ? 1.35 : 1.3,
        color: isNote ? '#1f2937' : shape.color,
        background: isNote ? shape.color : isLabel || isFrame || isCell ? 'rgba(255,254,251,0.95)' : 'transparent',
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: `${-pad}px ${-pad}px`
      }}
    />
  )
}
