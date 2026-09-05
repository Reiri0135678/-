import type { JSX } from 'react'
import { useEffect } from 'react'
import type { BoardEditor, Point } from './editor'
import { useEditorSnapshot } from './hooks'

export interface MenuState {
  screen: Point
  page: Point
  shapeId: string | null
}

/** 右クリックメニュー */
export function ContextMenu({ editor, state, onClose, onExport, onComment }: { editor: BoardEditor; state: MenuState; onClose: () => void; onExport: (scope: 'page' | 'selection') => void; onComment: (at: Point, shapeId: string | null) => void }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  useEffect(() => {
    // メニューの外を押したとき、または何かキーを押したときに閉じる
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.menu')) onClose()
    }
    const onKey = () => onClose()
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const sel = snap.selection
  const has = sel.length > 0
  const multi = sel.length >= 2
  const anyLocked = sel.some((id) => snap.byId.get(id)?.locked)
  const anyGrouped = sel.some((id) => snap.byId.get(id)?.groupId)
  const ro = snap.readonly
  const item = (label: string, fn: () => void, opts: { disabled?: boolean; key?: string; testid?: string } = {}) => (
    <button
      key={label}
      className="menu__item"
      disabled={opts.disabled}
      data-testid={opts.testid}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        fn()
        onClose()
      }}
    >
      <span>{label}</span>
      {opts.key && <kbd>{opts.key}</kbd>}
    </button>
  )
  const style = { left: Math.min(state.screen.x, window.innerWidth - 240), top: Math.min(state.screen.y, window.innerHeight - 420) }
  return (
    <div className="menu" style={style} data-testid="context-menu" onContextMenu={(e) => e.preventDefault()}>
      {item('コピー', () => void editor.copy(), { disabled: !has, key: 'Ctrl+C', testid: 'menu-copy' })}
      {item('切り取り', () => void editor.cut(), { disabled: !has || ro, key: 'Ctrl+X' })}
      {item('貼り付け', () => void editor.paste(state.page), { disabled: ro, key: 'Ctrl+V', testid: 'menu-paste' })}
      {item('複製', () => editor.select(editor.duplicate(sel)), { disabled: !has || ro, key: 'Ctrl+D' })}
      {item('削除', () => editor.deleteShapes(sel), { disabled: !has || ro || anyLocked, key: 'Del' })}
      <div className="menu__sep" />
      {item('最前面へ', () => editor.bringToFront(sel), { disabled: !has || ro, key: 'Ctrl+Shift+]', testid: 'menu-front' })}
      {item('前へ', () => editor.bringForward(sel), { disabled: !has || ro, key: 'Ctrl+]' })}
      {item('後ろへ', () => editor.sendBackward(sel), { disabled: !has || ro, key: 'Ctrl+[' })}
      {item('最背面へ', () => editor.sendToBack(sel), { disabled: !has || ro, key: 'Ctrl+Shift+[', testid: 'menu-back' })}
      <div className="menu__sep" />
      {item(anyGrouped ? 'グループ解除' : 'グループ化', () => (anyGrouped ? editor.ungroupSelection() : editor.groupSelection()), { disabled: !(multi || anyGrouped) || ro, key: 'Ctrl+G' })}
      {item(anyLocked ? 'ロック解除' : 'ロック', () => editor.setLocked(sel, !anyLocked), { disabled: !has || ro, key: 'Ctrl+L' })}
      {item('コメントを付ける', () => onComment(state.page, state.shapeId), { disabled: ro, testid: 'menu-comment' })}
      <div className="menu__sep" />
      {item(has ? '選択範囲を PNG 保存' : 'ページを PNG 保存', () => onExport(has ? 'selection' : 'page'), { testid: 'menu-export' })}
    </div>
  )
}
