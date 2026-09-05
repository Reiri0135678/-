import { useMemo } from 'react'
import type { ImageShape, RequestCardShape, Shape } from '@shared/shapes'
import type { BoardEditor } from '../canvas/editor'
import { useEditorSnapshot } from '../canvas/hooks'

/** ボード上の依頼カード一覧(リアクティブ) */
export function useCards(editor: BoardEditor): RequestCardShape[] {
  const snap = useEditorSnapshot(editor)
  return useMemo(() => snap.shapes.filter((s): s is RequestCardShape => s.type === 'request-card'), [snap.shapes])
}

/** ボード上の画像図形一覧(リアクティブ) */
export function useImages(editor: BoardEditor): ImageShape[] {
  const snap = useEditorSnapshot(editor)
  return useMemo(() => snap.shapes.filter((s): s is ImageShape => s.type === 'image'), [snap.shapes])
}

/** 単一選択されている図形(なければ null) */
export function useSingleSelection(editor: BoardEditor): Shape | null {
  const snap = useEditorSnapshot(editor)
  return snap.selection.length === 1 ? (snap.byId.get(snap.selection[0]!) ?? null) : null
}

export function focusShape(editor: BoardEditor, id: string): void {
  editor.zoomTo(id)
}

export function updateCard(editor: BoardEditor, id: string, patch: Partial<RequestCardShape>): void {
  editor.updateShape<RequestCardShape>(id, patch)
}

/** 画面中央に依頼カードを作って選択する */
export function addCardAtCenter(editor: BoardEditor): void {
  const snap = editor.getSnapshot()
  void snap
  const el = document.querySelector('.board') as HTMLElement | null
  const w = el?.clientWidth ?? 800
  const h = el?.clientHeight ?? 600
  const c = editor.screenToPage({ x: w / 2, y: h / 2 })
  const s = editor.createShape<RequestCardShape>({
    type: 'request-card',
    x: c.x - 110,
    y: c.y - 66,
    requester: editor.userName,
    requestedAt: today()
  })
  editor.select(s.id)
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
