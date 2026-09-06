import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Rect, Transformer } from 'react-konva'
import type { ImageShape } from '@shared/shapes'
import type { BoardEditor } from './editor'
import { loadImageSize } from './useImage'

/** 画像のトリミング: 画像の上に切り抜き枠を出し、枠を動かして「適用」 */
export function CropOverlay({ editor, image, scale }: { editor: BoardEditor; image: ImageShape; scale: number }): JSX.Element {
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [box, setBox] = useState({ x: image.x + image.w * 0.1, y: image.y + image.h * 0.1, w: image.w * 0.8, h: image.h * 0.8 })
  const natural = useRef<{ w: number; h: number } | null>(null)
  useEffect(() => {
    loadImageSize(image.src).then((n) => (natural.current = image.crop ? { w: image.crop.w, h: image.crop.h } : n)).catch(() => (natural.current = { w: image.w, h: image.h }))
    // 元画像のピクセル寸法。既に切り抜き済みなら切り抜き範囲の寸法を基準にする
  }, [image.src, image.crop, image.w, image.h])
  useEffect(() => {
    if (trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [])
  const clamp = (b: { x: number; y: number; w: number; h: number }) => {
    const x = Math.max(image.x, Math.min(b.x, image.x + image.w - 10))
    const y = Math.max(image.y, Math.min(b.y, image.y + image.h - 10))
    const w = Math.max(10, Math.min(b.w, image.x + image.w - x))
    const h = Math.max(10, Math.min(b.h, image.y + image.h - y))
    return { x, y, w, h }
  }
  const sync = () => {
    const n = rectRef.current
    if (!n) return
    const b = clamp({ x: n.x(), y: n.y(), w: n.width() * n.scaleX(), h: n.height() * n.scaleY() })
    n.scaleX(1)
    n.scaleY(1)
    n.setAttrs(b)
    setBox(b)
  }
  const apply = () => {
    const nat = natural.current
    if (!nat) return
    // 既に切り抜き済みの場合、cropImage は現在の crop を基準にするので natural は全体寸法を渡す
    editor.cropImage(image.id, box, image.crop ? { w: image.crop.w, h: image.crop.h } : nat)
  }
  ;(window as unknown as { __qcCrop?: { apply: () => void; setBox: (b: typeof box) => void } }).__qcCrop = { apply, setBox: (b) => setBox(clamp(b)) }
  const k = 1 / scale
  return (
    <>
      {/* 外側を暗くする */}
      <Rect x={image.x} y={image.y} width={image.w} height={box.y - image.y} fill="rgba(20,20,19,0.45)" listening={false} />
      <Rect x={image.x} y={box.y + box.h} width={image.w} height={image.y + image.h - (box.y + box.h)} fill="rgba(20,20,19,0.45)" listening={false} />
      <Rect x={image.x} y={box.y} width={box.x - image.x} height={box.h} fill="rgba(20,20,19,0.45)" listening={false} />
      <Rect x={box.x + box.w} y={box.y} width={image.x + image.w - (box.x + box.w)} height={box.h} fill="rgba(20,20,19,0.45)" listening={false} />
      <Rect ref={rectRef} x={box.x} y={box.y} width={box.w} height={box.h} stroke="#fffefb" strokeWidth={1.5 * k} dash={[6 * k, 4 * k]} draggable onDragMove={sync} onDragEnd={sync} onTransform={sync} onTransformEnd={sync} name="crop-box" />
      <Transformer ref={trRef} rotateEnabled={false} keepRatio={false} anchorSize={8} borderStroke="#d97757" anchorStroke="#d97757" anchorFill="#fffefb" boundBoxFunc={(_o, n) => (n.width < 10 || n.height < 10 ? _o : n)} />
    </>
  )
}
