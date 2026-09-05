import type { CommentThread, GeoKind, LineDash, PageInfo, Shape, TextAlign } from '@shared/shapes'

/** エディタの公開型。BoardEditor と UI 部品が共有する */
export type ToolId =
  | 'select'
  | 'hand'
  | 'draw'
  | 'highlight'
  | 'eraser'
  | 'text'
  | 'note'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'frame'
  | 'table'
  | 'request-card'
  | 'comment'
  | 'laser'

export interface Camera {
  x: number
  y: number
  scale: number
}
export interface Point {
  x: number
  y: number
}
export interface Collaborator {
  clientId: number
  name: string
  color: string
  cursor: Point | null
  selection: string[]
  /** 描画途中の図形(ペンの線など)。書き終える前から相手に見せる */
  draft: Shape | null
  /** 見ているページ */
  page: string
  /** 見ている範囲(追従用) */
  view: { x: number; y: number; scale: number; w: number; h: number } | null
  /** レーザーポインターの軌跡(直近の点列と時刻) */
  laser: { points: number[]; ts: number } | null
}
export interface Style {
  color: string
  size: number
  noteColor: string
  fill: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  dash: LineDash
  geoKind: GeoKind
}
export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface EditorSnapshot {
  /** 現在のページの図形(重なり順) */
  shapes: Shape[]
  /** 全ページの図形 */
  allShapes: Shape[]
  byId: ReadonlyMap<string, Shape>
  pages: PageInfo[]
  currentPage: string
  comments: CommentThread[]
  showResolved: boolean
  /** 追従中の相手(clientId) */
  following: number | null
  /** 編集中のセル(表) */
  editingCell: { r: number; c: number } | null
  /** トリミング中の画像 id */
  cropping: string | null
  selection: string[]
  tool: ToolId
  camera: Camera
  collaborators: Collaborator[]
  status: ConnectionStatus
  readonly: boolean
  canUndo: boolean
  canRedo: boolean
  editingId: string | null
  style: Style
  version: number
}

export interface EditorOptions {
  roomId: string
  userName: string
  readonly: boolean
  /** WebSocket の接続先。省略時は同一ホストの /api/connect */
  wsBase?: string
}
