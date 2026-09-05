import { BaseBoxShapeTool, type TLShape } from 'tldraw'
import { todayString } from '@shared/request-card'

/** クリックまたはドラッグで依頼カードを置くツール。作成時に依頼者と依頼日を自動記録する */
export class RequestCardTool extends BaseBoxShapeTool {
  static override id = 'request-card'
  static override initial = 'idle'
  override shapeType = 'request-card' as const

  override onCreate(shape: TLShape | null): void {
    if (!shape || shape.type !== 'request-card') return
    this.editor.updateShape({
      id: shape.id,
      type: 'request-card',
      props: { requester: this.editor.user.getName(), requestedAt: todayString() }
    })
  }
}
