/**
 * ボード上の図形データの定義。クライアント(描画)とサーバー(同期・kintone)の両方から参照する。
 * Yjs の `shapes` マップに shapeId → Y.Map(この形の平坦なオブジェクト)で保持する。
 */
export const REQUEST_STATUSES = ['未受付', '受付', '検査中', '完了'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export type ShapeType =
  | 'draw'
  | 'text'
  | 'note'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'image'
  | 'request-card'

export interface ShapeBase {
  id: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** 重なり順(大きいほど手前) */
  z: number
  /** 最後に触った人(監査用) */
  by: string
  updatedAt: number
}

export interface DrawShape extends ShapeBase {
  type: 'draw'
  /** 図形座標系の点列 [x0,y0,x1,y1,...] */
  points: number[]
  color: string
  size: number
  /** 蛍光ペンは半透明 */
  opacity: number
}
export interface TextShape extends ShapeBase {
  type: 'text'
  text: string
  color: string
  fontSize: number
}
export interface NoteShape extends ShapeBase {
  type: 'note'
  text: string
  color: string
}
export interface ArrowShape extends ShapeBase {
  type: 'arrow'
  /** 始点は (x,y)、終点は (x+dx, y+dy) */
  dx: number
  dy: number
  color: string
  size: number
}
export interface RectShape extends ShapeBase {
  type: 'rect'
  color: string
  fill: string
  size: number
}
export interface EllipseShape extends ShapeBase {
  type: 'ellipse'
  color: string
  fill: string
  size: number
}
export interface ImageShape extends ShapeBase {
  type: 'image'
  src: string
  name: string
}
export interface RequestCardShape extends ShapeBase {
  type: 'request-card'
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  status: RequestStatus
  /** 依頼者名(カード作成時のユーザー名を自動記録) */
  requester: string
  /** 依頼日 YYYY-MM-DD */
  requestedAt: string
  /** 備考・検査項目のメモ */
  note: string
  /** 紐付けた図面・写真(画像図形)の id */
  linkedShapeIds: string[]
  /** kintone 連携済みならレコード番号。未連携は空文字 */
  kintoneRecordId: string
}

export type Shape =
  | DrawShape
  | TextShape
  | NoteShape
  | ArrowShape
  | RectShape
  | EllipseShape
  | ImageShape
  | RequestCardShape

export const CARD_W = 220
export const CARD_H = 148

export const DEFAULT_COLOR = '#1f2937'
export const COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea'] as const
export const NOTE_COLORS = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3'] as const

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ShapeDefaults = DistributiveOmit<Shape, 'id' | 'x' | 'y' | 'z' | 'by' | 'updatedAt'>

/** 型ごとの既定値(id / 座標 / z / by / updatedAt は作成時に埋める) */
export function defaultsFor(type: ShapeType): ShapeDefaults {
  const base = { w: 0, h: 0, rotation: 0 }
  switch (type) {
    case 'draw':
      return { ...base, type, points: [], color: DEFAULT_COLOR, size: 3, opacity: 1 }
    case 'text':
      return { ...base, type, w: 200, h: 28, text: '', color: DEFAULT_COLOR, fontSize: 18 }
    case 'note':
      return { ...base, type, w: 180, h: 180, text: '', color: NOTE_COLORS[0] }
    case 'arrow':
      return { ...base, type, dx: 100, dy: 0, color: DEFAULT_COLOR, size: 3 }
    case 'rect':
      return { ...base, type, w: 120, h: 80, color: DEFAULT_COLOR, fill: 'transparent', size: 2 }
    case 'ellipse':
      return { ...base, type, w: 120, h: 80, color: DEFAULT_COLOR, fill: 'transparent', size: 2 }
    case 'image':
      return { ...base, type, w: 200, h: 150, src: '', name: '' }
    case 'request-card':
      return {
        ...base,
        type,
        w: CARD_W,
        h: CARD_H,
        title: '検査依頼',
        dept: '製造1課',
        partNo: '',
        lot: '',
        qty: '',
        status: '未受付',
        requester: '',
        requestedAt: '',
        note: '',
        linkedShapeIds: [],
        kintoneRecordId: ''
      }
  }
}

/** 保存データから読み込んだ図形の欠損項目を既定値で補う(古い版との互換) */
export function normalizeShape(raw: Record<string, unknown>): Shape | null {
  const type = raw['type'] as ShapeType
  if (!type || typeof raw['id'] !== 'string') return null
  try {
    const d = defaultsFor(type)
    return {
      ...d,
      ...raw,
      x: Number(raw['x'] ?? 0),
      y: Number(raw['y'] ?? 0),
      z: Number(raw['z'] ?? 0),
      by: String(raw['by'] ?? ''),
      updatedAt: Number(raw['updatedAt'] ?? 0)
    } as Shape
  } catch {
    return null
  }
}

/** 今日の日付を YYYY-MM-DD で返す(ローカル時刻) */
export function todayString(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---- kintone 連携・CSV 用の平坦なレコード --------------------------------
export interface RequestRecord {
  shapeId: string
  boardName: string
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  status: RequestStatus
  requester: string
  requestedAt: string
  note: string
  kintoneRecordId: string
}

export const REQUEST_RECORD_COLUMNS: Array<{ key: keyof RequestRecord; label: string }> = [
  { key: 'status', label: '状態' },
  { key: 'title', label: '件名' },
  { key: 'dept', label: '依頼部門' },
  { key: 'partNo', label: '品番' },
  { key: 'lot', label: 'ロット' },
  { key: 'qty', label: '数量' },
  { key: 'requester', label: '依頼者' },
  { key: 'requestedAt', label: '依頼日' },
  { key: 'note', label: '備考' },
  { key: 'kintoneRecordId', label: 'kintone' },
  { key: 'boardName', label: 'ボード' },
  { key: 'shapeId', label: 'ID' }
]

export function toRequestRecord(card: RequestCardShape, boardName: string): RequestRecord {
  return {
    shapeId: card.id,
    boardName,
    title: card.title,
    dept: card.dept,
    partNo: card.partNo,
    lot: card.lot,
    qty: card.qty,
    status: card.status,
    requester: card.requester,
    requestedAt: card.requestedAt,
    note: card.note,
    kintoneRecordId: card.kintoneRecordId
  }
}

/** Excel で開ける CSV(BOM 付き UTF-8) */
export function toCsv(records: RequestRecord[]): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = REQUEST_RECORD_COLUMNS.map((c) => esc(c.label)).join(',')
  const rows = records.map((r) => REQUEST_RECORD_COLUMNS.map((c) => esc(String(r[c.key]))).join(','))
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}
