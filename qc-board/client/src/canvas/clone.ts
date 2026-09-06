import type { Shape } from '@shared/shapes'
import { newGroupId, newId } from './ids'
import type { Point } from './types'

/**
 * 図形の組を新しい id で複製する(貼り付け・雛形の挿入で共用)。
 * - 位置を off だけずらす。ページ・重なり順・ロックは貼り付け先で付け直すので落とす
 * - グループは組の中で付け直す
 * - 矢印の吸着は、吸着先も一緒に複製される場合だけ保つ
 * - resetCards: 依頼カードの受付番号と kintone 番号を空にする(採番し直し)。紐付け図面は、一緒に複製したか exists で残っているものだけ残す
 */
export function remapShapes(shapes: Shape[], off: Point, opts: { resetCards: boolean; exists: (id: string) => boolean }): Shape[] {
  const idMap = new Map(shapes.map((s) => [s.id, newId()]))
  const groupMap = new Map<string, string>()
  return shapes.map((s) => {
    const copy = { ...s, id: idMap.get(s.id)!, x: s.x + off.x, y: s.y + off.y, locked: false } as Shape
    delete (copy as Partial<Shape>).page
    delete (copy as Partial<Shape>).z
    if (s.groupId) {
      if (!groupMap.has(s.groupId)) groupMap.set(s.groupId, newGroupId())
      copy.groupId = groupMap.get(s.groupId)!
    }
    if (copy.type === 'arrow') {
      copy.startBind = copy.startBind && idMap.has(copy.startBind.id) ? { ...copy.startBind, id: idMap.get(copy.startBind.id)! } : null
      copy.endBind = copy.endBind && idMap.has(copy.endBind.id) ? { ...copy.endBind, id: idMap.get(copy.endBind.id)! } : null
    }
    if (copy.type === 'request-card' && opts.resetCards) {
      copy.no = ''
      copy.kintoneRecordId = ''
      copy.linkedShapeIds = copy.linkedShapeIds.map((x) => idMap.get(x) ?? x).filter((x) => idMap.has(x) || opts.exists(x))
    }
    return copy
  })
}
