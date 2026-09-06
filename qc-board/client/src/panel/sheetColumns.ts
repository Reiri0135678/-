import { CLOSED_STATUSES, todayString, type RequestRecord } from '@shared/shapes'

export type SortKey = keyof RequestRecord
export interface Column {
  key: SortKey
  label: string
  width: number
  kind: 'select' | 'priority' | 'result' | 'text' | 'date' | 'readonly'
}

/** 一覧の列定義。順番がそのまま表示順 */
export const COLUMNS: Column[] = [
  { key: 'no', label: '受付番号', width: 118, kind: 'readonly' },
  { key: 'status', label: '状態', width: 100, kind: 'select' },
  { key: 'priority', label: '優先度', width: 84, kind: 'priority' },
  { key: 'title', label: '件名', width: 120, kind: 'text' },
  { key: 'dept', label: '依頼部門', width: 100, kind: 'text' },
  { key: 'partNo', label: '品番', width: 110, kind: 'text' },
  { key: 'lot', label: 'ロット', width: 100, kind: 'text' },
  { key: 'qty', label: '数量', width: 64, kind: 'text' },
  { key: 'requester', label: '依頼者', width: 90, kind: 'text' },
  { key: 'requestedAt', label: '依頼日', width: 130, kind: 'date' },
  { key: 'dueDate', label: '希望納期', width: 130, kind: 'date' },
  { key: 'assignee', label: '担当', width: 90, kind: 'text' },
  { key: 'note', label: '備考', width: 200, kind: 'text' },
  { key: 'result', label: '結果', width: 110, kind: 'result' },
  { key: 'resultNote', label: '所見', width: 160, kind: 'text' },
  { key: 'judgedBy', label: '判定者', width: 80, kind: 'readonly' },
  { key: 'judgedAt', label: '判定日', width: 96, kind: 'readonly' },
  { key: 'kintoneRecordId', label: 'kintone', width: 80, kind: 'readonly' }
]

export const DAY = 86400_000
/** localStorage のキー(表示列・列幅) */
export const COLS_KEY = 'qc.sheet.cols'
export const WIDTHS_KEY = 'qc.sheet.widths'

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
export function saveJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}


/** 納期の状態: 超過 / 2 日以内 / 余裕 / 納期なし・終了済み */
export function dueState(rec: Pick<RequestRecord, 'dueDate' | 'status'>, today = todayString()): 'overdue' | 'soon' | 'ok' | 'none' {
  if (!rec.dueDate || CLOSED_STATUSES.includes(rec.status)) return 'none'
  const diff = Math.round((Date.parse(rec.dueDate) - Date.parse(today)) / DAY)
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return 'ok'
}

