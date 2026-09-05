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
  note: T.string
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
  note: ''
}

// ---- マイグレーション --------------------------------------------------
// 保存済みボード(JSON スナップショット)に props を後から足すときは必ずここに追記する。
const versions = createShapePropsMigrationIds('request-card', {
  AddRequesterAndNote: 1
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
