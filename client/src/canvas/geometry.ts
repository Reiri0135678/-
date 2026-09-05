import type { ArrowBinding, ArrowShape, Shape } from '@shared/shapes'
import type { Point } from './types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 吸着情報から矢印の x,y,dx,dy を求める。端点は吸着先の外周まで引く */
export function resolveArrow(a: ArrowShape, get: (id: string) => Shape | undefined): Pick<ArrowShape, 'x' | 'y' | 'dx' | 'dy'> {
  let start: Point = { x: a.x, y: a.y }
  let end: Point = { x: a.x + a.dx, y: a.y + a.dy }
  const sShape = a.startBind ? get(a.startBind.id) : undefined
  const eShape = a.endBind ? get(a.endBind.id) : undefined
  if (sShape && a.startBind) start = anchorPoint(sShape, a.startBind)
  if (eShape && a.endBind) end = anchorPoint(eShape, a.endBind)
  if (eShape) end = clipToBounds(start, end, shapeBounds(eShape), 6)
  if (sShape) start = clipToBounds(end, start, shapeBounds(sShape), 6)
  return { x: start.x, y: start.y, dx: end.x - start.x, dy: end.y - start.y }
}

export function anchorPoint(s: Shape, b: ArrowBinding): Point {
  const r = shapeBounds(s)
  return { x: r.x + r.w * b.nx, y: r.y + r.h * b.ny }
}

export function bindingFor(s: Shape, p: Point): ArrowBinding {
  const r = shapeBounds(s)
  return { id: s.id, nx: r.w ? Math.min(1, Math.max(0, (p.x - r.x) / r.w)) : 0.5, ny: r.h ? Math.min(1, Math.max(0, (p.y - r.y) / r.h)) : 0.5 }
}

/** from → to の線分が矩形(pad で外側に広げたもの)に入る点を返す。入らなければ to のまま */
function clipToBounds(from: Point, to: Point, r: Rect, pad: number): Point {
  const x0 = r.x - pad
  const y0 = r.y - pad
  const x1 = r.x + r.w + pad
  const y1 = r.y + r.h + pad
  const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
  if (inside(from)) return to
  const dx = to.x - from.x
  const dy = to.y - from.y
  let tMin = Infinity
  const consider = (t: number, ok: boolean) => {
    if (ok && t >= 0 && t <= 1 && t < tMin) tMin = t
  }
  if (dx !== 0) {
    for (const X of [x0, x1]) {
      const t = (X - from.x) / dx
      const y = from.y + dy * t
      consider(t, y >= y0 && y <= y1)
    }
  }
  if (dy !== 0) {
    for (const Y of [y0, y1]) {
      const t = (Y - from.y) / dy
      const x = from.x + dx * t
      consider(t, x >= x0 && x <= x1)
    }
  }
  if (!Number.isFinite(tMin)) return to
  return { x: from.x + dx * tMin, y: from.y + dy * tMin }
}

/** 図形の外接矩形(回転は無視) */
export function shapeBounds(s: Shape): Rect {
  if (s.type === 'arrow') {
    return { x: Math.min(s.x, s.x + s.dx), y: Math.min(s.y, s.y + s.dy), w: Math.abs(s.dx) || 1, h: Math.abs(s.dy) || 1 }
  }
  return { x: s.x, y: s.y, w: s.w || 1, h: s.h || 1 }
}

export function boundsOf(shapes: Shape[]): Rect | null {
  if (shapes.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of shapes) {
    const b = shapeBounds(s)
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 移動中の矩形を、他の図形の端・中心に揃える。返り値は補正量とガイド線の位置 */
export function snapTo(
  moving: Rect,
  others: Shape[],
  threshold: number
): { dx: number; dy: number; guides: { x: number[]; y: number[] } } {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]
  let bestX: { d: number; at: number } | null = null
  let bestY: { d: number; at: number } | null = null
  for (const o of others) {
    const b = shapeBounds(o)
    const ox = [b.x, b.x + b.w / 2, b.x + b.w]
    const oy = [b.y, b.y + b.h / 2, b.y + b.h]
    for (const a of mx) for (const t of ox) {
      const d = t - a
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t }
    }
    for (const a of my) for (const t of oy) {
      const d = t - a
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t }
    }
  }
  return { dx: bestX?.d ?? 0, dy: bestY?.d ?? 0, guides: { x: bestX ? [bestX.at] : [], y: bestY ? [bestY.at] : [] } }
}
