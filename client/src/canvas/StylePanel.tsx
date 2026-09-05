import type { JSX } from 'react'
import { COLORS, NOTE_COLORS, type TextAlign } from '@shared/shapes'
import { useEditor, useEditorSnapshot } from './hooks'

const SIZES: Array<{ label: string; value: number }> = [
  { label: 'S', value: 2 },
  { label: 'M', value: 3 },
  { label: 'L', value: 6 }
]
const FONT_SIZES = [14, 18, 24, 32]

/** 右上のスタイルパネル: 色・太さ・付箋色・塗り・文字装飾・グループ・ロック。選択中の図形にも即時適用 */
export function StylePanel(): JSX.Element | null {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  if (snap.readonly) return null
  const sel = editor.getSelectedShapes()
  const types = new Set(sel.map((s) => s.type))
  const showNote = snap.tool === 'note' || types.has('note')
  const showText = snap.tool === 'text' || snap.tool === 'note' || types.has('text') || types.has('note')
  const showFill = snap.tool === 'rect' || snap.tool === 'ellipse' || types.has('rect') || types.has('ellipse')
  const showColor = !(showNote && types.size === 1 && sel.length > 0) || sel.length === 0
  const anyLocked = sel.some((s) => s.locked)
  const anyGrouped = sel.some((s) => s.groupId)
  // 選択中の文字図形の装飾(混在時は既定値)
  const first = sel.find((s) => s.type === 'text' || s.type === 'note') as { bold: boolean; italic: boolean; underline: boolean; align: TextAlign; fontSize: number } | undefined
  const t = first ?? snap.style
  return (
    <div className="style-panel" data-testid="style-panel">
      {showColor && (
        <div className="style-panel__row">
          {COLORS.map((c) => (
            <button key={c} className="swatch" data-active={snap.style.color === c} style={{ background: c }} title={c} onClick={() => editor.setStyle({ color: c })} />
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
            <button key={c} className="swatch swatch--note" data-active={snap.style.noteColor === c} style={{ background: c }} onClick={() => editor.setStyle({ noteColor: c })} />
          ))}
        </div>
      )}
      {showText && (
        <>
          <div className="style-panel__row" data-testid="text-style">
            <button className="chip chip--b" data-active={t.bold} title="太字" onClick={() => editor.setStyle({ bold: !t.bold })} data-style="bold">
              B
            </button>
            <button className="chip chip--i" data-active={t.italic} title="斜体" onClick={() => editor.setStyle({ italic: !t.italic })} data-style="italic">
              I
            </button>
            <button className="chip chip--u" data-active={t.underline} title="下線" onClick={() => editor.setStyle({ underline: !t.underline })} data-style="underline">
              U
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className="chip" data-active={t.align === a} title={a === 'left' ? '左揃え' : a === 'center' ? '中央' : '右揃え'} onClick={() => editor.setStyle({ align: a })} data-align={a}>
                {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
              </button>
            ))}
          </div>
          <div className="style-panel__row">
            {FONT_SIZES.map((f) => (
              <button key={f} className="chip" data-active={t.fontSize === f} onClick={() => editor.setStyle({ fontSize: f })} data-font-size={f}>
                {f}
              </button>
            ))}
          </div>
        </>
      )}
      {sel.length > 0 && (
        <div className="style-panel__row">
          {sel.length >= 2 && !anyGrouped && (
            <button className="chip" onClick={() => editor.groupSelection()} title="グループ化 (Ctrl+G)" data-testid="group">
              グループ
            </button>
          )}
          {anyGrouped && (
            <button className="chip" onClick={() => editor.ungroupSelection()} title="グループ解除 (Ctrl+Shift+G)" data-testid="ungroup">
              解除
            </button>
          )}
          <button className="chip" data-active={anyLocked} onClick={() => editor.setLocked(sel.map((s) => s.id), !anyLocked)} title="ロック (Ctrl+L)" data-testid="lock">
            {anyLocked ? '🔓 解除' : '🔒 ロック'}
          </button>
        </div>
      )}
    </div>
  )
}
