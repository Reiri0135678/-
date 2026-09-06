import { createContext, useContext, useSyncExternalStore } from 'react'
import type { BoardEditor } from './editor'
import type { EditorSnapshot } from './types'

export const EditorContext = createContext<BoardEditor | null>(null)

export function useEditor(): BoardEditor {
  const e = useContext(EditorContext)
  if (!e) throw new Error('EditorContext がありません')
  return e
}

/** エディタのスナップショットを購読する。セレクタは毎回呼ばれるので軽く保つ */
export function useEditorSnapshot(editor: BoardEditor): EditorSnapshot {
  return useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
}
