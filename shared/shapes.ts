/**
 * ボード上の図形データの定義。クライアント(描画)とサーバー(同期・kintone)の両方から参照する。
 * Yjs の `shapes` マップに shapeId → Y.Map(この形の平坦なオブジェクト)で保持する。
 */
export const REQUEST_STATUSES = ['未受付', '受付', '検査中', '保留', '差戻し', '完了', '取消'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
/** 終了扱いの状態(アーカイブ対象) */
export const CLOSED_STATUSES: readonly RequestStatus[] = ['完了', '取消']
export const PRIORITIES = ['通常', '至急'] as const
export type Priority = (typeof PRIORITIES)[number]
export const RESULTS = ['未判定', '合格', '条件付合格', '不合格'] as const
export type InspectionResult = (typeof RESULTS)[number]

/**
 * 状態遷移ルール(現在の状態 → 移れる状態)。運用に合わせてここを書き換える。
 * - 差戻し: 情報不足で依頼者に返す。依頼者が直したら「受付」へ
 * - 保留: 一時停止。再開は「受付」または「検査中」
 * - 完了 → 検査中: 不合格の再検査など
 */
export const STATUS_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  未受付: ['受付', '差戻し', '取消'],
  受付: ['検査中', '保留', '差戻し', '取消'],
  検査中: ['完了', '保留', '差戻し', '受付'],
  保留: ['受付', '検査中', '取消'],
  差戻し: ['受付', '取消'],
  完了: ['検査中'],
  取消: ['未受付']
}
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return from === to || (STATUS_TRANSITIONS[from] ?? []).includes(to)
}

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
  /** 受付番号(サーバーが採番。例 QC-2026-0001)。人が参照する主キー */
  no: string
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
  /** 担当検査員 */
  assignee: string
  /** 希望納期 YYYY-MM-DD */
  dueDate: string
  priority: Priority
  /** 検査結果 */
  result: InspectionResult
  /** 測定値・所見など */
  resultNote: string
  judgedBy: string
  /** 判定日 YYYY-MM-DD */
  judgedAt: string
  /** ボードから外した(一覧・kintone には残る) */
  archived: boolean
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

/** ペン・図形の色(落ち着いた暖色系のパレット) */
export const DEFAULT_COLOR = '#141413'
export const COLORS = ['#141413', '#b5462b', '#3f6f9e', '#5f7a45', '#d97757', '#7b5c9c'] as const
/** 付箋の色(紙色) */
export const NOTE_COLORS = ['#f7ebcf', '#dfe9f2', '#e4e9d9', '#f3dcd4'] as const
export const HIGHLIGHT_COLOR = '#f2d16b'

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
        no: '',
        title: '検査依頼',
        dept: '製造1課',
        partNo: '',
        lot: '',
        qty: '',
        status: '未受付',
        requester: '',
        requestedAt: '',
        note: '',
        assignee: '',
        dueDate: '',
        priority: '通常',
        result: '未判定',
        resultNote: '',
        judgedBy: '',
        judgedAt: '',
        archived: false,
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
  no: string
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  status: RequestStatus
  requester: string
  requestedAt: string
  note: string
  assignee: string
  dueDate: string
  priority: Priority
  result: InspectionResult
  resultNote: string
  judgedBy: string
  judgedAt: string
  archived: boolean
  kintoneRecordId: string
}

export const REQUEST_RECORD_COLUMNS: Array<{ key: keyof RequestRecord; label: string }> = [
  { key: 'no', label: '受付番号' },
  { key: 'status', label: '状態' },
  { key: 'priority', label: '優先度' },
  { key: 'title', label: '件名' },
  { key: 'dept', label: '依頼部門' },
  { key: 'partNo', label: '品番' },
  { key: 'lot', label: 'ロット' },
  { key: 'qty', label: '数量' },
  { key: 'requester', label: '依頼者' },
  { key: 'requestedAt', label: '依頼日' },
  { key: 'dueDate', label: '希望納期' },
  { key: 'assignee', label: '担当' },
  { key: 'note', label: '備考' },
  { key: 'result', label: '結果' },
  { key: 'resultNote', label: '所見' },
  { key: 'judgedBy', label: '判定者' },
  { key: 'judgedAt', label: '判定日' },
  { key: 'archived', label: 'アーカイブ' },
  { key: 'kintoneRecordId', label: 'kintone' },
  { key: 'boardName', label: 'ボード' },
  { key: 'shapeId', label: 'ID' }
]

export function toRequestRecord(card: RequestCardShape, boardName: string): RequestRecord {
  return {
    shapeId: card.id,
    boardName,
    no: card.no,
    title: card.title,
    dept: card.dept,
    partNo: card.partNo,
    lot: card.lot,
    qty: card.qty,
    status: card.status,
    requester: card.requester,
    requestedAt: card.requestedAt,
    note: card.note,
    assignee: card.assignee,
    dueDate: card.dueDate,
    priority: card.priority,
    result: card.result,
    resultNote: card.resultNote,
    judgedBy: card.judgedBy,
    judgedAt: card.judgedAt,
    archived: card.archived,
    kintoneRecordId: card.kintoneRecordId
  }
}

/** Excel で開ける CSV(BOM 付き UTF-8) */
export function toCsv(records: RequestRecord[]): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = REQUEST_RECORD_COLUMNS.map((c) => esc(c.label)).join(',')
  const rows = records.map((r) =>
    REQUEST_RECORD_COLUMNS.map((c) => esc(typeof r[c.key] === 'boolean' ? (r[c.key] ? '1' : '') : String(r[c.key]))).join(',')
  )
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}

// ---- 変更履歴 ----------------------------------------------------------
export interface HistoryEntry {
  ts: number
  user: string
  shapeId: string
  shapeType: ShapeType
  action: 'create' | 'update' | 'delete'
  /** 変更後の値(update は変わった項目のみ) */
  fields: Record<string, unknown>
  /** 受付番号(カードのとき) */
  no?: string
}
