import type { JSX } from 'react'
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  T,
  resizeBox,
  type RecordProps,
  type TLResizeInfo,
  type TLShape
} from 'tldraw'

/**
 * 検査依頼カード図形。
 * 将来 kintone のレコードと 1:1 で対応させる想定。props はそのままレコード項目に写せる粒度に保つ。
 */
export type RequestStatus = '未受付' | '受付' | '検査中' | '完了'

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

// tldraw 5 系は独自図形をモジュール拡張で型登録する
declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'request-card': RequestCardProps
  }
}

export type RequestCardShape = TLShape<'request-card'>

export class RequestCardShapeUtil extends BaseBoxShapeUtil<RequestCardShape> {
  static override type = 'request-card' as const

  static override props: RecordProps<RequestCardShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    dept: T.string,
    partNo: T.string,
    lot: T.string,
    qty: T.string,
    status: T.literalEnum('未受付', '受付', '検査中', '完了')
  }

  override getDefaultProps(): RequestCardShape['props'] {
    return {
      w: 220,
      h: 120,
      title: '検査依頼',
      dept: '製造1課',
      partNo: '',
      lot: '',
      qty: '',
      status: '未受付'
    }
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
