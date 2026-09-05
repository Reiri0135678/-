import type { JSX } from 'react'
import { useState } from 'react'
import { useEditor, useEditorSnapshot } from './hooks'
import { TEMPLATES } from './templates'

/** 雛形の挿入メニュー(ツールバー下部) */
export function TemplateMenu(): JSX.Element | null {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  const [open, setOpen] = useState(false)
  if (snap.readonly) return null
  const insert = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    const vp = editor.getViewport()
    const center = editor.screenToPage({ x: vp.w / 2, y: vp.h / 2 })
    editor.insertShapes(t.build(), center)
    setOpen(false)
  }
  return (
    <div className="tpl">
      <button className="qc-toolbar__btn" onClick={() => setOpen((v) => !v)} title="雛形を挿入" data-testid="tpl-btn">
        <span className="qc-toolbar__icon">▦</span>
        <span>雛形</span>
      </button>
      {open && (
        <div className="tpl__pop" data-testid="tpl-pop">
          <b>雛形を挿入</b>
          {TEMPLATES.map((t) => (
            <button key={t.id} className="tpl__item" onClick={() => insert(t.id)} data-tpl={t.id}>
              <span>{t.name}</span>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
