import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { EllipseShape, NoteShape, RectShape, TextShape } from '@shared/shapes'
import type { BoardEditor } from './editor'
import { useEditorSnapshot } from './hooks'

/** 文字・付箋の文字入力オーバーレイ(キャンバス上の位置に textarea を重ねる) */
export function TextEditor({ editor, shapeId }: { editor: BoardEditor; shapeId: string }): JSX.Element | null {
  const snap = useEditorSnapshot(editor)
  const shape = snap.byId.get(shapeId) as TextShape | NoteShape | RectShape | EllipseShape | undefined
  const isLabel = shape?.type === 'rect' || shape?.type === 'ellipse'
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(shape ? (shape.type === 'rect' || shape.type === 'ellipse' ? shape.label : shape.text) : '')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [shapeId])

  useEffect(() => {
    if (shape && shape.type === 'text' && ref.current) {
      // 文字図形は高さを内容に合わせる
      const h = ref.current.scrollHeight / snap.camera.scale
      if (Math.abs(h - shape.h) > 2) editor.updateShape(shapeId, { h })
    }
  }, [value, shape, editor, shapeId, snap.camera.scale])

  if (!shape) return null

  const commit = () => {
    if (isLabel) editor.updateShape(shapeId, { label: value } as Partial<RectShape>)
    else editor.updateShape(shapeId, { text: value } as Partial<TextShape>)
    if (shape.type === 'text' && value.trim() === '') editor.deleteShapes([shapeId])
    editor.setEditing(null)
  }

  const pos = editor.pageToScreen({ x: shape.x, y: shape.y })
  const k = snap.camera.scale
  const isNote = shape.type === 'note'
  const pad = isNote ? 12 * k : isLabel ? 8 * k : 0
  const styled = shape.type === 'text' || shape.type === 'note' ? shape : { bold: false, italic: false, underline: false, align: 'center' as const, fontSize: shape.fontSize, color: shape.color }

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
        }
        e.stopPropagation()
      }}
      style={{
        left: pos.x + pad,
        top: pos.y + pad,
        width: (shape.w - (isNote ? 24 : isLabel ? 16 : 0)) * k,
        height: (shape.h - (isNote ? 24 : isLabel ? 16 : 0)) * k,
        fontSize: shape.fontSize * k,
        fontWeight: styled.bold ? 700 : 400,
        fontStyle: styled.italic ? 'italic' : 'normal',
        textDecoration: styled.underline ? 'underline' : 'none',
        textAlign: styled.align,
        lineHeight: isNote ? 1.35 : 1.3,
        color: isNote ? '#1f2937' : shape.color,
        background: isNote ? shape.color : isLabel ? 'rgba(255,254,251,0.85)' : 'transparent',
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: `${-pad}px ${-pad}px`
      }}
    />
  )
}
