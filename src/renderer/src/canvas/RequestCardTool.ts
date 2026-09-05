import { BaseBoxShapeTool } from 'tldraw'

/** クリックまたはドラッグで依頼カードを置くツール */
export class RequestCardTool extends BaseBoxShapeTool {
  static override id = 'request-card'
  static override initial = 'idle'
  override shapeType = 'request-card' as const
}
