import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { deleteTemplate, listTemplates, type UserTemplateInfo } from '../api'
import type { TemplateShape } from './templates'
import { useEditor, useEditorSnapshot } from './hooks'
import { TEMPLATES } from './templates'

/** 雛形の挿入メニュー(ツールバー下部) */
export function TemplateMenu(): JSX.Element | null {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState<UserTemplateInfo[]>([])
  const reload = () => listTemplates().then(setCustom).catch(() => setCustom([]))
  useEffect(() => {
    if (open) void reload()
    const h = () => void reload()
    window.addEventListener('qc-templates-changed', h)
    return () => window.removeEventListener('qc-templates-changed', h)
  }, [open])
  useEffect(() => {
    if (!open) return
    // Esc か、メニューの外を押したときに閉じる
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.tpl')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, { capture: true })
    }
  }, [open])
  if (snap.readonly) return null
  const insertCustom = (t: UserTemplateInfo) => {
    const vp = editor.getViewport()
    const center = editor.screenToPage({ x: vp.w / 2, y: vp.h / 2 })
    editor.insertShapes(t.shapes as TemplateShape[], center)
    setOpen(false)
  }
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
          {custom.length > 0 && <b className="tpl__head">自作の雛形</b>}
          {custom.map((t) => (
            <div key={t.id} className="tpl__custom" data-testid="tpl-custom">
              <button className="tpl__item" onClick={() => insertCustom(t)} data-tpl-custom={t.id}>
                <span>{t.name}</span>
                <small>
                  {t.by} · {t.shapes.length} 図形
                </small>
              </button>
              {(t.by === editor.userName || true) && (
                <button
                  className="link"
                  title="削除(作成者か管理者)"
                  onClick={() => {
                    if (window.confirm(`雛形「${t.name}」を削除しますか?`)) deleteTemplate(t.id).then(reload).catch((e) => window.alert(e instanceof Error ? e.message : String(e)))
                  }}
                  data-tpl-delete={t.id}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <small className="muted">自作: 図形を選んで右クリック →「選択範囲を雛形として保存」</small>
        </div>
      )}
    </div>
  )
}
