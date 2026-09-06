import type { JSX } from 'react'
import { useEditor, useEditorSnapshot } from './hooks'

/** 左下のページ切替。ダブルクリックで名前変更、空のページは × で削除 */
export function PageBar(): JSX.Element {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  const counts = new Map<string, number>()
  for (const s of snap.allShapes) counts.set(s.page, (counts.get(s.page) ?? 0) + 1)
  const peers = new Map<string, number>()
  for (const c of snap.collaborators) peers.set(c.page, (peers.get(c.page) ?? 0) + 1)
  return (
    <div className="page-bar" data-testid="page-bar">
      {snap.pages.map((p) => (
        <button
          key={p.id}
          className="page-tab"
          data-active={p.id === snap.currentPage}
          data-page={p.id}
          onClick={() => editor.setPage(p.id)}
          onDoubleClick={() => {
            if (snap.readonly) return
            const name = window.prompt('ページ名', p.name)
            if (name) editor.renamePage(p.id, name)
          }}
          title={`${p.name}(${counts.get(p.id) ?? 0} 図形)`}
        >
          {p.name}
          {(peers.get(p.id) ?? 0) > 0 && <span className="page-tab__peers">{peers.get(p.id)}</span>}
          {!snap.readonly && p.id !== 'p1' && (counts.get(p.id) ?? 0) === 0 && (
            <span
              className="page-tab__x"
              title="空のページを削除"
              onClick={(e) => {
                e.stopPropagation()
                editor.deletePage(p.id)
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
      {!snap.readonly && (
        <button className="page-tab page-tab--add" onClick={() => editor.addPage()} title="ページを追加" data-testid="page-add">
          +
        </button>
      )}
    </div>
  )
}
