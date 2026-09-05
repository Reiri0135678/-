import type { JSX } from 'react'
import { COLORS, NOTE_COLORS } from '@shared/shapes'
import { useEditor, useEditorSnapshot } from './hooks'

const SIZES: Array<{ label: string; value: number }> = [
  { label: 'S', value: 2 },
  { label: 'M', value: 3 },
  { label: 'L', value: 6 }
]

/** 右上のスタイルパネル: 色・太さ・付箋色・塗り。選択中の図形にも即時適用 */
export function StylePanel(): JSX.Element | null {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  if (snap.readonly) return null
  const sel = editor.getSelectedShapes()
  const types = new Set(sel.map((s) => s.type))
  const showNote = snap.tool === 'note' || types.has('note')
  const showFill = snap.tool === 'rect' || snap.tool === 'ellipse' || types.has('rect') || types.has('ellipse')
  const showColor = !(showNote && types.size === 1 && sel.length > 0) || sel.length === 0
  return (
    <div className="style-panel" data-testid="style-panel">
      {showColor && (
        <div className="style-panel__row">
          {COLORS.map((c) => (
            <button
              key={c}
              className="swatch"
              data-active={snap.style.color === c}
              style={{ background: c }}
              title={c}
              onClick={() => editor.setStyle({ color: c })}
            />
          ))}
        </div>
      )}
      <div className="style-panel__row">
        {SIZES.map((s) => (
          <button key={s.label} className="chip" data-active={snap.style.size === s.value} onClick={() => editor.setStyle({ size: s.value })}>
            {s.label}
          </button>
        ))}
        {showFill && (
          <button
            className="chip"
            data-active={snap.style.fill !== 'transparent'}
            title="塗りつぶし"
            onClick={() => editor.setStyle({ fill: snap.style.fill === 'transparent' ? `${snap.style.color}22` : 'transparent' })}
          >
            塗り
          </button>
        )}
      </div>
      {showNote && (
        <div className="style-panel__row">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className="swatch swatch--note"
              data-active={snap.style.noteColor === c}
              style={{ background: c }}
              onClick={() => editor.setStyle({ noteColor: c })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
