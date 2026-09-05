import { useValue, type Editor, type TLImageShape, type TLShapeId } from 'tldraw'
import type { RequestCardShape } from '../canvas/RequestCardShape'

/** ボード上の依頼カード一覧(リアクティブ) */
export function useCards(editor: Editor): RequestCardShape[] {
  return useValue(
    'request cards',
    () => editor.getCurrentPageShapes().filter((s): s is RequestCardShape => s.type === 'request-card'),
    [editor]
  )
}

/** ボード上の画像図形一覧(リアクティブ) */
export function useImages(editor: Editor): TLImageShape[] {
  return useValue(
    'images',
    () => editor.getCurrentPageShapes().filter((s): s is TLImageShape => s.type === 'image'),
    [editor]
  )
}

/** 単一選択されている図形(なければ null) */
export function useSingleSelection(editor: Editor) {
  return useValue(
    'single selection',
    () => {
      const sel = editor.getSelectedShapes()
      return sel.length === 1 ? sel[0]! : null
    },
    [editor]
  )
}

export function imageSrc(editor: Editor, img: TLImageShape): string | null {
  if (!img.props.assetId) return null
  const asset = editor.getAsset(img.props.assetId)
  return asset && asset.type === 'image' ? asset.props.src : null
}

export function imageName(editor: Editor, img: TLImageShape): string {
  if (!img.props.assetId) return '画像'
  const asset = editor.getAsset(img.props.assetId)
  return asset && asset.type === 'image' ? asset.props.name || '画像' : '画像'
}

export function focusShape(editor: Editor, id: TLShapeId): void {
  editor.select(id)
  editor.zoomToSelection({ animation: { duration: 200 } })
}

export function updateCard(editor: Editor, id: TLShapeId, patch: Partial<RequestCardShape['props']>): void {
  editor.updateShape<RequestCardShape>({ id, type: 'request-card', props: patch })
}
