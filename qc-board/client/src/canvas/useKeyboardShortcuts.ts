import { useEffect, useState } from 'react'
import type { BoardEditor } from './editor'
import { KEY_TOOLS } from './tools'

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

/**
 * ボードのキーボード操作。入力欄にフォーカスがあるときは何もしない。
 * 返り値はスペースキーの押下状態(押している間は一時的にパン)
 */
export function useKeyboardShortcuts(editor: BoardEditor, onFind: () => void): boolean {
  const [spaceDown, setSpaceDown] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = editor.getSnapshot()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (e.key === ' ') {
        setSpaceDown(true)
        e.preventDefault()
        return
      }
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redoOnce()
        else editor.undoOnce()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        editor.redoOnce()
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        if (!s.readonly && s.selection.length) editor.select(editor.duplicate(s.selection))
        return
      }
      if (mod && key === 'c') {
        if (s.selection.length) {
          e.preventDefault()
          void editor.copy()
        }
        return
      }
      if (mod && key === 'x') {
        if (s.selection.length) {
          e.preventDefault()
          void editor.cut()
        }
        return
      }
      if (mod && key === 'f') {
        e.preventDefault()
        onFind()
        return
      }
      if (mod && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        if (!s.selection.length || s.readonly) return
        if (e.key === ']') (e.shiftKey ? editor.bringToFront : editor.bringForward).call(editor, s.selection)
        else (e.shiftKey ? editor.sendToBack : editor.sendBackward).call(editor, s.selection)
        return
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && s.selection.length && !s.readonly) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        editor.nudge(s.selection, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
        return
      }
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) editor.ungroupSelection()
        else editor.groupSelection()
        return
      }
      if (mod && key === 'l') {
        e.preventDefault()
        if (!s.readonly && s.selection.length) {
          const anyLocked = s.selection.some((id) => s.byId.get(id)?.locked)
          editor.setLocked(s.selection, !anyLocked)
        }
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        editor.select(s.shapes.map((x) => x.id))
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!s.readonly && s.selection.length) editor.deleteShapes(s.selection)
        return
      }
      if (e.key === 'Escape') {
        editor.setEditing(null)
        editor.selectNone()
        editor.setTool('select')
        return
      }
      if (e.key === '=' || e.key === '+') return editor.zoomBy(1.2)
      if (e.key === '-') return editor.zoomBy(1 / 1.2)
      if (e.key === '0') return editor.zoomToFit()
      const tool = KEY_TOOLS[key]
      if (tool && !mod && !e.altKey) editor.setTool(tool)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [editor, onFind])
  return spaceDown
}
