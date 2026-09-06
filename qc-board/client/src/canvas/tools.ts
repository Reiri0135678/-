import { CARD_H, CARD_W, HIGHLIGHT_COLOR, defaultsFor, type DrawShape, type Shape } from '@shared/shapes'
import type { Point, Style, ToolId } from './types'
import { boundsOf } from './geometry'

/** ドラッグで大きさを決めて作るツール */
export const CREATE_TOOLS: ReadonlySet<ToolId> = new Set(['arrow', 'line', 'rect', 'ellipse', 'frame', 'request-card'])

/** 1 文字のショートカット → ツール */
export const KEY_TOOLS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  d: 'draw',
  g: 'highlight',
  e: 'eraser',
  t: 'text',
  n: 'note',
  a: 'arrow',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  f: 'frame',
  b: 'table',
  c: 'request-card',
  m: 'comment',
  p: 'laser'
}

/** ペン・蛍光ペンの線の見た目(蛍光は太めで半透明) */
export function drawStyle(tool: ToolId, st: Style): Pick<DrawShape, 'color' | 'size' | 'opacity'> {
  const hl = tool === 'highlight'
  return { color: hl ? HIGHLIGHT_COLOR : st.color, size: hl ? Math.max(st.size, 4) : st.size, opacity: hl ? 0.45 : 1 }
}

/** ドラッグ中の仮図形。a が始点、b が現在位置 */
export function makeDraft(tool: ToolId, st: Style, a: Point, b: Point, id: string): Shape {
  const base = { id, z: 0, by: '', updatedAt: 0 }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  if (tool === 'arrow' || tool === 'line')
    return { ...defaultsFor('arrow'), ...base, x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y, color: st.color, size: st.size, dash: st.dash, headEnd: tool === 'arrow', headStart: false } as Shape
  if (tool === 'rect') return { ...defaultsFor('rect'), ...base, x, y, w, h, color: st.color, size: st.size, fill: st.fill, dash: st.dash, kind: st.geoKind } as Shape
  if (tool === 'ellipse') return { ...defaultsFor('ellipse'), ...base, x, y, w, h, color: st.color, size: st.size, fill: st.fill, dash: st.dash } as Shape
  if (tool === 'frame') return { ...defaultsFor('frame'), ...base, x, y, w: Math.max(200, w), h: Math.max(140, h) } as Shape
  return { ...defaultsFor('request-card'), ...base, x: a.x, y: a.y, w: Math.max(CARD_W, w), h: Math.max(CARD_H, h) } as Shape
}

/** ペンの軌跡(ページ座標)を、左上を原点にした draw 図形の中身へ */
export function drawFromPoints(points: number[]): Pick<DrawShape, 'x' | 'y' | 'w' | 'h' | 'points'> {
  if (points.length < 4) {
    // 点打ち: 小さな点にする
    points = [...points, points[0]! + 0.5, points[1]! + 0.5]
  }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]!)
    y0 = Math.min(y0, points[i + 1]!)
    x1 = Math.max(x1, points[i]!)
    y1 = Math.max(y1, points[i + 1]!)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, points: points.map((v, i) => (i % 2 === 0 ? v - x0 : v - y0)) }
}

/** 選択図形を雛形用に整える: 左上を原点にし、作成者・ページ・重なり順・ロックを落とす */
export function templateShapesFrom(shapes: Shape[]): Array<Omit<Shape, 'z' | 'by' | 'updatedAt' | 'page'>> {
  const b = boundsOf(shapes)
  if (!b) return []
  return shapes.map((sh) => {
    const { z: _z, by: _b, updatedAt: _u, page: _p, ...rest } = sh
    void _z
    void _b
    void _u
    void _p
    return { ...rest, x: sh.x - b.x, y: sh.y - b.y, locked: false }
  })
}
