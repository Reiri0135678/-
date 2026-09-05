import type { JSX } from 'react'
import { useEditor, useEditorSnapshot } from './hooks'
import type { ToolId } from './editor'

type Item = { id: ToolId; label: string; icon: string; key: string } | 'sep'

const ITEMS: Item[] = [
  { id: 'select', label: '選択', icon: '⬚', key: 'V' },
  { id: 'hand', label: '移動', icon: '✋', key: 'H' },
  'sep',
  { id: 'draw', label: 'ペン', icon: '✎', key: 'D' },
  { id: 'highlight', label: '蛍光', icon: '▬', key: 'G' },
  { id: 'eraser', label: '消す', icon: '⌫', key: 'E' },
  'sep',
  { id: 'text', label: '文字', icon: 'T', key: 'T' },
  { id: 'note', label: '付箋', icon: '▣', key: 'N' },
  { id: 'arrow', label: '矢印', icon: '→', key: 'A' },
  { id: 'line', label: '直線', icon: '╱', key: 'L' },
  { id: 'rect', label: '四角', icon: '▭', key: 'R' },
  { id: 'ellipse', label: '楕円', icon: '◯', key: 'O' },
  'sep',
  { id: 'request-card', label: '依頼', icon: '📋', key: 'C' },
  { id: 'comment', label: 'コメント', icon: '💬', key: 'M' }
]

/** 左側の縦型ツールバー */
export function QcToolbar(): JSX.Element {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  const editable = !snap.readonly
  return (
    <div className="qc-toolbar" role="toolbar" aria-label="ツール">
      {ITEMS.map((it, i) =>
        it === 'sep' ? (
          <div key={`sep-${i}`} className="qc-toolbar__sep" />
        ) : (
          <button
            key={it.id}
            className="qc-toolbar__btn"
            data-active={snap.tool === it.id}
            data-tool={it.id}
            disabled={!editable && it.id !== 'select' && it.id !== 'hand'}
            title={`${it.label} (${it.key})`}
            onClick={() => editor.setTool(it.id)}
          >
            <span className="qc-toolbar__icon">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        )
      )}
      <div className="qc-toolbar__sep" />
      <button className="qc-toolbar__btn" disabled={!snap.canUndo} title="元に戻す (Ctrl+Z)" onClick={() => editor.undoOnce()}>
        <span className="qc-toolbar__icon">↶</span>
        <span>戻す</span>
      </button>
      <button className="qc-toolbar__btn" disabled={!snap.canRedo} title="やり直す (Ctrl+Y)" onClick={() => editor.redoOnce()}>
        <span className="qc-toolbar__icon">↷</span>
        <span>進む</span>
      </button>
    </div>
  )
}
