import type { JSX } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Arrow, Ellipse, Group, Image as KImage, Line, Rect, Text } from 'react-konva'
import { getStroke } from 'perfect-freehand'
import type { DrawShape, ImageShape, NoteShape, RequestCardShape, Shape, TextShape } from '@shared/shapes'
import { useImage } from '../useImage'

export interface ShapeHandlers {
  onPointerDown(shape: Shape, e: KonvaEventObject<PointerEvent>): void
  onDblClick(shape: Shape, e: KonvaEventObject<MouseEvent | TouchEvent>): void
  onDragStart(shape: Shape, e: KonvaEventObject<DragEvent>): void
  onDragMove(shape: Shape, e: KonvaEventObject<DragEvent>): void
  onDragEnd(shape: Shape, e: KonvaEventObject<DragEvent>): void
  onTransformEnd(shape: Shape, e: KonvaEventObject<Event>): void
}

export interface ShapeViewProps {
  shape: Shape
  /** ドラフト(作成中プレビュー)は操作不可 */
  draft?: boolean
  draggable: boolean
  handlers?: ShapeHandlers
}

const FONT = "'Segoe UI', 'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif"
const STATUS_BG: Record<string, string> = { 未受付: '#e5e7eb', 受付: '#dbeafe', 検査中: '#fef3c7', 保留: '#f3e8ff', 差戻し: '#fee2e2', 完了: '#dcfce7', 取消: '#e5e7eb' }

/** 1 図形 = 1 Group。Group に shapeId 属性を付け、当たり判定から図形を逆引きする */
export function ShapeView({ shape, draft, draggable, handlers }: ShapeViewProps): JSX.Element {
  const common = {
    id: shape.id,
    shapeId: shape.id,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    draggable: draggable && !draft,
    opacity: draft ? 0.7 : 1,
    listening: !draft,
    onPointerDown: handlers ? (e: KonvaEventObject<PointerEvent>) => handlers.onPointerDown(shape, e) : undefined,
    onDblClick: handlers ? (e: KonvaEventObject<MouseEvent>) => handlers.onDblClick(shape, e) : undefined,
    onDblTap: handlers ? (e: KonvaEventObject<TouchEvent>) => handlers.onDblClick(shape, e) : undefined,
    onDragStart: handlers ? (e: KonvaEventObject<DragEvent>) => handlers.onDragStart(shape, e) : undefined,
    onDragMove: handlers ? (e: KonvaEventObject<DragEvent>) => handlers.onDragMove(shape, e) : undefined,
    onDragEnd: handlers ? (e: KonvaEventObject<DragEvent>) => handlers.onDragEnd(shape, e) : undefined,
    onTransformEnd: handlers ? (e: KonvaEventObject<Event>) => handlers.onTransformEnd(shape, e) : undefined
  }

  switch (shape.type) {
    case 'draw':
      return (
        <Group {...common}>
          <DrawView shape={shape} />
        </Group>
      )
    case 'text':
      return (
        <Group {...common}>
          <TextView shape={shape} />
        </Group>
      )
    case 'note':
      return (
        <Group {...common}>
          <NoteView shape={shape} />
        </Group>
      )
    case 'arrow':
      return (
        <Group {...common}>
          <Arrow
            points={[0, 0, shape.dx, shape.dy]}
            stroke={shape.color}
            fill={shape.color}
            strokeWidth={shape.size}
            pointerLength={10 + shape.size}
            pointerWidth={10 + shape.size}
            hitStrokeWidth={16}
            lineCap="round"
          />
        </Group>
      )
    case 'rect':
      return (
        <Group {...common}>
          <Rect
            width={shape.w}
            height={shape.h}
            stroke={shape.color}
            strokeWidth={shape.size}
            fill={shape.fill === 'transparent' ? undefined : shape.fill}
            cornerRadius={4}
            hitStrokeWidth={12}
          />
          {shape.fill === 'transparent' && <Rect width={shape.w} height={shape.h} fill="rgba(0,0,0,0.001)" />}
        </Group>
      )
    case 'ellipse':
      return (
        <Group {...common}>
          <Ellipse
            x={shape.w / 2}
            y={shape.h / 2}
            radiusX={Math.max(1, shape.w / 2)}
            radiusY={Math.max(1, shape.h / 2)}
            stroke={shape.color}
            strokeWidth={shape.size}
            fill={shape.fill === 'transparent' ? 'rgba(0,0,0,0.001)' : shape.fill}
            hitStrokeWidth={12}
          />
        </Group>
      )
    case 'image':
      return (
        <Group {...common}>
          <ImageView shape={shape} />
        </Group>
      )
    case 'request-card':
      return (
        <Group {...common}>
          <CardView shape={shape} />
        </Group>
      )
  }
}

function DrawView({ shape }: { shape: DrawShape }): JSX.Element {
  if (shape.opacity < 1) {
    // 蛍光ペン: 太い半透明の線
    return (
      <Line
        points={shape.points}
        stroke={shape.color}
        strokeWidth={shape.size * 4}
        opacity={shape.opacity}
        lineCap="round"
        lineJoin="round"
        tension={0.3}
        hitStrokeWidth={Math.max(shape.size * 4, 14)}
        globalCompositeOperation="multiply"
      />
    )
  }
  const pts: number[][] = []
  for (let i = 0; i < shape.points.length; i += 2) pts.push([shape.points[i]!, shape.points[i + 1]!])
  const outline = getStroke(pts, { size: shape.size * 2, thinning: 0.5, smoothing: 0.5, streamline: 0.5 })
  return (
    <>
      <Line points={outline.flat()} closed fill={shape.color} />
      <Line points={shape.points} stroke="rgba(0,0,0,0.001)" strokeWidth={1} hitStrokeWidth={14} />
    </>
  )
}

function TextView({ shape }: { shape: TextShape }): JSX.Element {
  return (
    <Text
      text={shape.text || ' '}
      width={shape.w}
      fontSize={shape.fontSize}
      fontFamily={FONT}
      fill={shape.color}
      lineHeight={1.3}
      wrap="word"
    />
  )
}

function NoteView({ shape }: { shape: NoteShape }): JSX.Element {
  return (
    <>
      <Rect width={shape.w} height={shape.h} fill={shape.color} shadowColor="rgba(0,0,0,.18)" shadowBlur={8} shadowOffsetY={3} cornerRadius={3} />
      <Text
        text={shape.text}
        x={12}
        y={12}
        width={shape.w - 24}
        height={shape.h - 24}
        fontSize={18}
        fontFamily={FONT}
        fill="#1f2937"
        lineHeight={1.35}
        wrap="word"
        ellipsis
      />
    </>
  )
}

function ImageView({ shape }: { shape: ImageShape }): JSX.Element {
  const img = useImage(shape.src)
  if (!img) {
    return (
      <>
        <Rect width={shape.w} height={shape.h} fill="#f3f4f6" stroke="#d9dde3" dash={[6, 4]} />
        <Text text={shape.name || '画像'} width={shape.w} height={shape.h} align="center" verticalAlign="middle" fontFamily={FONT} fontSize={12} fill="#6b7280" />
      </>
    )
  }
  return <KImage image={img} width={shape.w} height={shape.h} />
}

function CardView({ shape: s }: { shape: RequestCardShape }): JSX.Element {
  const w = s.w
  const h = s.h
  const rowY = [40, 62, 84]
  const status = s.status
  const badge = STATUS_BG[status] ?? '#e5e7eb'
  const badges = [
    s.linkedShapeIds.length ? `📎 図面 ${s.linkedShapeIds.length}` : '',
    s.kintoneRecordId ? `kintone #${s.kintoneRecordId}` : ''
  ]
    .filter(Boolean)
    .join('   ')
  const urgent = s.priority === '至急'
  const cancelled = s.status === '取消'
  const head = s.no ? `${s.no}` : s.title
  return (
    <>
      <Rect
        width={w}
        height={h}
        fill={cancelled ? '#f3f4f6' : '#fffbe6'}
        stroke={urgent ? '#dc2626' : cancelled ? '#d1d5db' : '#f0c36d'}
        strokeWidth={urgent ? 2 : 1}
        cornerRadius={6}
        shadowColor="rgba(0,0,0,.08)"
        shadowBlur={6}
        shadowOffsetY={2}
        opacity={cancelled ? 0.7 : 1}
      />
      {urgent && <Rect x={0} y={0} width={6} height={h} fill="#dc2626" cornerRadius={[6, 0, 0, 6]} />}
      <Text text={head} x={12} y={11} width={w - 80} fontSize={13} fontStyle="bold" fontFamily={FONT} fill="#1f2937" ellipsis wrap="none" />
      {s.no && s.title && s.title !== '検査依頼' && (
        <Text text={s.title} x={12} y={26} width={w - 80} fontSize={10} fontFamily={FONT} fill="#6b7280" ellipsis wrap="none" />
      )}
      {badges && <Text text={badges} x={10} y={h - 38} width={w - 20} fontSize={10} fontFamily={FONT} fill="#166534" ellipsis wrap="none" />}
      <Rect x={w - 66} y={9} width={56} height={20} fill={badge} cornerRadius={10} />
      <Text text={status} x={w - 66} y={9} width={56} height={20} align="center" verticalAlign="middle" fontSize={11} fontFamily={FONT} fill="#1f2937" />
      <Text text="部門" x={10} y={rowY[0]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#1f2937" />
      <Text text={s.dept || '-'} x={50} y={rowY[0]} width={w - 60} fontSize={12} fontFamily={FONT} fill="#4b5563" ellipsis wrap="none" />
      <Text text="品番" x={10} y={rowY[1]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#1f2937" />
      <Text text={s.partNo || '-'} x={50} y={rowY[1]} width={w - 60} fontSize={12} fontFamily={FONT} fill="#4b5563" ellipsis wrap="none" />
      <Text text="ロット" x={10} y={rowY[2]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#1f2937" />
      <Text text={s.lot || '-'} x={50} y={rowY[2]} width={70} fontSize={12} fontFamily={FONT} fill="#4b5563" ellipsis wrap="none" />
      <Text text="数量" x={126} y={rowY[2]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#1f2937" />
      <Text text={s.qty || '-'} x={160} y={rowY[2]} width={w - 170} fontSize={12} fontFamily={FONT} fill="#4b5563" ellipsis wrap="none" />
      <Text text={s.requester || '(依頼者未設定)'} x={10} y={h - 20} width={w / 2} fontSize={10} fontFamily={FONT} fill="#6b7280" ellipsis wrap="none" />
      <Text text={s.requestedAt} x={w / 2} y={h - 20} width={w / 2 - 10} align="right" fontSize={10} fontFamily={FONT} fill="#6b7280" />
    </>
  )
}

/** 当たり判定で得たノードから図形 id を逆引き */
export function shapeIdOf(node: Konva.Node | null): string | null {
  let n: Konva.Node | null = node
  while (n) {
    const id = n.getAttr('shapeId') as string | undefined
    if (id) return id
    n = n.getParent()
  }
  return null
}
