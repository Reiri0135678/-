import { T } from '@tldraw/validate'
import type { RecordProps, TLBaseShape } from '@tldraw/tlschema'

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
  status: T.literalEnum(...REQUEST_STATUSES)
}

export const requestCardDefaultProps: RequestCardProps = {
  w: 220,
  h: 120,
  title: '検査依頼',
  dept: '製造1課',
  partNo: '',
  lot: '',
  qty: '',
  status: '未受付'
}
