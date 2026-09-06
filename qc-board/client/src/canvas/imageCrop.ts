import type { ImageShape } from '@shared/shapes'
import type { Rect } from './geometry'

/**
 * 画像を表示上の矩形(ページ座標)で切り抜く差分。元画像は残し、crop に元画像ピクセルの矩形を記録する。
 * natural は「現在表示している範囲」のピクセル寸法(未切り抜きなら元画像全体)
 */
export function cropPatch(img: ImageShape, rect: Rect, natural: { w: number; h: number }): Partial<ImageShape> {
  const cur = img.crop ?? { x: 0, y: 0, w: natural.w, h: natural.h }
  const rx = Math.max(0, Math.min(1, (rect.x - img.x) / img.w))
  const ry = Math.max(0, Math.min(1, (rect.y - img.y) / img.h))
  const rw = Math.max(0.02, Math.min(1 - rx, rect.w / img.w))
  const rh = Math.max(0.02, Math.min(1 - ry, rect.h / img.h))
  const crop = { x: Math.round(cur.x + cur.w * rx), y: Math.round(cur.y + cur.h * ry), w: Math.round(cur.w * rw), h: Math.round(cur.h * rh) }
  return { crop, x: img.x + img.w * rx, y: img.y + img.h * ry, w: img.w * rw, h: img.h * rh }
}

/** 切り抜きを解除し、表示倍率を保ったまま全体に戻す差分。natural は元画像のピクセル寸法 */
export function uncropPatch(img: ImageShape, natural: { w: number; h: number }): Partial<ImageShape> | null {
  if (!img.crop) return null
  const k = img.w / img.crop.w
  return { crop: null, x: img.x - img.crop.x * k, y: img.y - img.crop.y * k, w: natural.w * k, h: natural.h * k }
}
