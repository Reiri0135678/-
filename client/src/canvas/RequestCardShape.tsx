import type { JSX } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  type RecordProps,
  type TLResizeInfo,
  type TLShape
} from 'tldraw'
import {
  requestCardDefaultProps,
  requestCardMigrations,
  requestCardProps,
  type RequestCardProps
} from '@shared/request-card'

// tldraw 5 系は独自図形をモジュール拡張で型登録する
declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'request-card': RequestCardProps
  }
}

export type RequestCardShape = TLShape<'request-card'>

/** 検査依頼カード図形の描画・操作。スキーマ本体は shared/request-card.ts */
export class RequestCardShapeUtil extends BaseBoxShapeUtil<RequestCardShape> {
  static override type = 'request-card' as const
  static override props: RecordProps<RequestCardShape> = requestCardProps
  static override migrations = requestCardMigrations

  override getDefaultProps(): RequestCardShape['props'] {
    return { ...requestCardDefaultProps }
  }

  override getGeometry(shape: RequestCardShape): Rectangle2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  override onResize(shape: RequestCardShape, info: TLResizeInfo<RequestCardShape>) {
    return resizeBox(shape, info)
  }

  override component(shape: RequestCardShape): JSX.Element {
    const p = shape.props
    return (
      <HTMLContainer>
        <div className="qc-card">
          <div className="qc-card__head">
            <span>{p.title}</span>
            <span className="qc-card__status" data-status={p.status}>
              {p.status}
            </span>
          </div>
          <div className="qc-card__row">
            <b>部門</b>
            <span>{p.dept}</span>
          </div>
          <div className="qc-card__row">
            <b>品番</b>
            <span>{p.partNo || '-'}</span>
          </div>
          <div className="qc-card__row">
            <b>ロット</b>
            <span>{p.lot || '-'}</span>
            <b>数量</b>
            <span>{p.qty || '-'}</span>
          </div>
          <div className="qc-card__foot">
            <span>{p.requester || '(依頼者未設定)'}</span>
            <span>{p.requestedAt}</span>
          </div>
        </div>
      </HTMLContainer>
    )
  }

  override getIndicatorPath(shape: RequestCardShape): Path2D {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 6)
    return path
  }
}
