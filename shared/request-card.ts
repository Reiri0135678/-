import { T } from '@tldraw/validate'
import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLBaseShape
} from '@tldraw/tlschema'

/**
 * 検査依頼カード図形のスキーマ定義。
 * クライアント(描画)とサーバー(同期・検証)の両方から参照するため React に依存しない。
 * props は将来 kintone レコード項目に 1:1 で写せる粒度に保つ。
 */
export const REQUEST_STATUSES = ['未受付', '受付', '検査中', '完了'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export interface RequestCardProps {
  w: number
  h: number
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
  /** 紐付けた図面・写真(画像図形)の shape id */
  linkedShapeIds: string[]
  /** kintone 連携済みならレコード番号。未連携は空文字 */
  kintoneRecordId: string
}

export type RequestCardShape = TLBaseShape<'request-card', RequestCardProps>

export const requestCardProps: RecordProps<RequestCardShape> = {
  w: T.number,
  h: T.number,
  title: T.string,
  dept: T.string,
  partNo: T.string,
  lot: T.string,
  qty: T.string,
  status: T.literalEnum(...REQUEST_STATUSES),
  requester: T.string,
  requestedAt: T.string,
  note: T.string,
  linkedShapeIds: T.arrayOf(T.string),
  kintoneRecordId: T.string
}

export const requestCardDefaultProps: RequestCardProps = {
  w: 220,
  h: 132,
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

// ---- マイグレーション --------------------------------------------------
// 保存済みボード(JSON スナップショット)に props を後から足すときは必ずここに追記する。
const versions = createShapePropsMigrationIds('request-card', {
  AddRequesterAndNote: 1,
  AddLinksAndKintone: 2
})

export const requestCardMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versions.AddRequesterAndNote,
      up(props) {
        props.requester ??= ''
        props.requestedAt ??= ''
        props.note ??= ''
      },
      down(props) {
        delete props.requester
        delete props.requestedAt
        delete props.note
      }
    },
    {
      id: versions.AddLinksAndKintone,
      up(props) {
        props.linkedShapeIds ??= []
        props.kintoneRecordId ??= ''
      },
      down(props) {
        delete props.linkedShapeIds
        delete props.kintoneRecordId
      }
    }
  ]
})

/** 今日の日付を YYYY-MM-DD で返す(ローカル時刻) */
export function todayString(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** kintone 連携や CSV 出力で使う、カード 1 枚分の平坦なレコード */
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

export function toRequestRecord(
  shape: { id: string; props: RequestCardProps },
  boardName: string
): RequestRecord {
  const p = shape.props
  return {
    shapeId: shape.id,
    boardName,
    title: p.title,
    dept: p.dept,
    partNo: p.partNo,
    lot: p.lot,
    qty: p.qty,
    status: p.status,
    requester: p.requester,
    requestedAt: p.requestedAt,
    note: p.note,
    kintoneRecordId: p.kintoneRecordId
  }
}

/** Excel で開ける CSV(BOM 付き UTF-8) */
export function toCsv(records: RequestRecord[]): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = REQUEST_RECORD_COLUMNS.map((c) => esc(c.label)).join(',')
  const rows = records.map((r) => REQUEST_RECORD_COLUMNS.map((c) => esc(String(r[c.key]))).join(','))
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}
