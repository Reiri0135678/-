import type { JSX } from 'react'
import { useEditor, useValue } from 'tldraw'

type Item = { id: string; label: string; icon: string } | 'sep'

/** tldraw の既定ツールバーを捨てて、自前の縦型ツールバーを描画する */
const ITEMS: Item[] = [
  { id: 'select', label: '選択', icon: '⬚' },
  { id: 'hand', label: '移動', icon: '✋' },
  'sep',
  { id: 'draw', label: 'ペン', icon: '✎' },
  { id: 'highlight', label: '蛍光', icon: '▬' },
  { id: 'eraser', label: '消す', icon: '⌫' },
  'sep',
  { id: 'text', label: '文字', icon: 'T' },
  { id: 'note', label: '付箋', icon: '▣' },
  { id: 'arrow', label: '矢印', icon: '→' },
  { id: 'geo', label: '図形', icon: '◯' },
  'sep',
  { id: 'request-card', label: '依頼', icon: '📋' }
]

export function QcToolbar(): JSX.Element {
  const editor = useEditor()
  const current = useValue('current tool', () => editor.getCurrentToolId(), [editor])

  return (
    <div className="qc-toolbar" role="toolbar" aria-label="ツール">
      {ITEMS.map((it, i) =>
        it === 'sep' ? (
          <div key={`sep-${i}`} className="qc-toolbar__sep" />
        ) : (
          <button
            key={it.id}
            className="qc-toolbar__btn"
            data-active={current === it.id}
            data-tool={it.id}
            title={it.label}
            onClick={() => editor.setCurrentTool(it.id)}
          >
            <span className="qc-toolbar__icon">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        )
      )}
    </div>
  )
}
