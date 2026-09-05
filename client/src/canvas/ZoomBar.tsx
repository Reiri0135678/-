import type { JSX } from 'react'
import { useEditor, useEditorSnapshot } from './hooks'

/** 右下のズーム操作 */
export function ZoomBar(): JSX.Element {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  return (
    <div className="zoom-bar">
      <button className="chip" onClick={() => editor.zoomBy(1 / 1.2)} title="縮小 (-)">
        −
      </button>
      <button className="chip chip--wide" onClick={() => editor.setCamera({ scale: 1 })} title="100%">
        {Math.round(snap.camera.scale * 100)}%
      </button>
      <button className="chip" onClick={() => editor.zoomBy(1.2)} title="拡大 (+)">
        +
      </button>
      <button className="chip" onClick={() => editor.zoomToFit()} title="全体表示 (0)">
        全体
      </button>
    </div>
  )
}
