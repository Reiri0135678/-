import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardEditor } from './editor'
import { useEditorSnapshot } from './hooks'

/** Ctrl+F の検索バー。文字・付箋・ラベル・依頼カードの文字を横断検索し、Enter で順に移動 */
export function FindBar({ editor, onClose }: { editor: BoardEditor; onClose: () => void }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const hits = useMemo(() => editor.find(q), [q, snap.allShapes, editor])
  const go = (n: number) => {
    if (hits.length === 0) return
    const idx = ((n % hits.length) + hits.length) % hits.length
    setI(idx)
    editor.zoomTo(hits[idx]!.id)
  }
  return (
    <div className="find" data-testid="find-bar">
      <input
        ref={ref}
        value={q}
        placeholder="ボード内を検索(品番・文字・ラベルなど)"
        onChange={(e) => {
          setQ(e.target.value)
          setI(0)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') go(e.shiftKey ? i - 1 : q && hits.length && i === 0 && !e.repeat ? 0 : i + 1)
          if (e.key === 'Escape') onClose()
        }}
        data-testid="find-input"
      />
      <span className="find__count" data-testid="find-count">
        {q ? (hits.length ? `${i + 1} / ${hits.length}` : '0 件') : ''}
      </span>
      <button className="chip" onClick={() => go(i - 1)} disabled={!hits.length} title="前へ">
        ↑
      </button>
      <button className="chip" onClick={() => go(i + 1)} disabled={!hits.length} title="次へ" data-testid="find-next">
        ↓
      </button>
      <button className="link" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
