import type { JSX } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Arrow, Ellipse, Group, Image as KImage, Line, Rect, Text } from 'react-konva'
import { getStroke } from 'perfect-freehand'
import { dashArray, type DrawShape, type EllipseShape, type FrameShape, type ImageShape, type NoteShape, type RectShape, type RequestCardShape, type Shape, type TableShape, type TextShape } from '@shared/shapes'
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

const FONT = "'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', 'Segoe UI', system-ui, sans-serif"
const DISPLAY = "'Lora', 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', Georgia, serif"
const STATUS_BG: Record<string, string> = { 未受付: '#e8e6dc', 受付: '#dfe9f2', 検査中: '#f6e4da', 保留: '#ebe4f0', 差戻し: '#f3dcd4', 完了: '#e4e9d9', 取消: '#e8e6dc' }

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
          <LockBadge shape={shape} />
        </Group>
      )
    case 'text':
      return (
        <Group {...common}>
          <TextView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'note':
      return (
        <Group {...common}>
          <NoteView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'arrow':
      return (
        <Group {...common}>
          {shape.headStart || shape.headEnd ? (
            <Arrow
              points={[0, 0, shape.dx, shape.dy]}
              stroke={shape.color}
              fill={shape.color}
              strokeWidth={shape.size}
              dash={dashArray(shape.dash, shape.size)}
              pointerLength={10 + shape.size}
              pointerWidth={10 + shape.size}
              pointerAtBeginning={shape.headStart}
              pointerAtEnding={shape.headEnd}
              hitStrokeWidth={16}
              lineCap="round"
            />
          ) : (
            <Line points={[0, 0, shape.dx, shape.dy]} stroke={shape.color} strokeWidth={shape.size} dash={dashArray(shape.dash, shape.size)} hitStrokeWidth={16} lineCap="round" />
          )}
          <LockBadge shape={shape} />
        </Group>
      )
    case 'rect':
      return (
        <Group {...common}>
          <GeoView shape={shape} />
          <LabelView shape={shape} />
          <LockBadge shape={shape} />
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
            dash={dashArray(shape.dash, shape.size)}
            fill={shape.fill === 'transparent' ? 'rgba(0,0,0,0.001)' : shape.fill}
            hitStrokeWidth={12}
          />
          <LabelView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'image':
      return (
        <Group {...common}>
          <ImageView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'frame':
      return (
        <Group {...common}>
          <FrameView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'table':
      return (
        <Group {...common}>
          <TableView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
    case 'request-card':
      return (
        <Group {...common}>
          <CardView shape={shape} />
          <LockBadge shape={shape} />
        </Group>
      )
  }
}

/** 区画: 中身の操作を邪魔しないよう、当たり判定は見出し帯と枠線だけ */
function FrameView({ shape }: { shape: FrameShape }): JSX.Element {
  const { w, h } = shape
  return (
    <>
      <Rect width={w} height={h} fill={`${shape.color}12`} stroke={shape.color} strokeWidth={1.5} dash={[8, 6]} cornerRadius={10} listening={false} />
      <Rect width={w} height={h} stroke="rgba(0,0,0,0.001)" strokeWidth={1} hitStrokeWidth={14} cornerRadius={10} />
      <Rect x={0} y={-30} width={Math.min(w, Math.max(80, shape.title.length * 14 + 24))} height={28} fill={shape.color} cornerRadius={[8, 8, 0, 0]} />
      <Text text={shape.title || '区画'} x={10} y={-30} height={28} verticalAlign="middle" fontSize={13} fontStyle="bold" fontFamily={FONT} fill="#fff" listening={false} />
    </>
  )
}

/** 四角系の図形(四角・角丸・三角・ひし形・六角) */
function GeoView({ shape }: { shape: RectShape }): JSX.Element {
  const { w, h } = shape
  const stroke = { stroke: shape.color, strokeWidth: shape.size, dash: dashArray(shape.dash, shape.size), hitStrokeWidth: 12, lineJoin: 'round' as const }
  const fill = shape.fill === 'transparent' ? 'rgba(0,0,0,0.001)' : shape.fill
  if (shape.kind === 'rect' || shape.kind === 'rounded') {
    return <Rect width={w} height={h} cornerRadius={shape.kind === 'rounded' ? Math.min(w, h) * 0.2 : 4} fill={fill} {...stroke} />
  }
  const pts =
    shape.kind === 'triangle'
      ? [w / 2, 0, w, h, 0, h]
      : shape.kind === 'diamond'
        ? [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
        : [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2]
  return <Line points={pts} closed fill={fill} {...stroke} />
}

/** 図形の中のラベル */
function LabelView({ shape }: { shape: RectShape | EllipseShape }): JSX.Element | null {
  if (!shape.label) return null
  return (
    <Text
      text={shape.label}
      x={8}
      y={8}
      width={Math.max(1, shape.w - 16)}
      height={Math.max(1, shape.h - 16)}
      align="center"
      verticalAlign="middle"
      fontSize={shape.fontSize}
      fontFamily={FONT}
      fill={shape.color}
      wrap="word"
      ellipsis
      listening={false}
    />
  )
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

function fontStyleOf(s: { bold: boolean; italic: boolean }): string {
  return [s.bold ? 'bold' : '', s.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'
}

function TextView({ shape }: { shape: TextShape }): JSX.Element {
  return (
    <Text
      text={shape.text || ' '}
      width={shape.w}
      fontSize={shape.fontSize}
      fontFamily={FONT}
      fontStyle={fontStyleOf(shape)}
      textDecoration={shape.underline ? 'underline' : ''}
      align={shape.align}
      fill={shape.color}
      lineHeight={1.3}
      wrap="word"
    />
  )
}

function NoteView({ shape }: { shape: NoteShape }): JSX.Element {
  return (
    <>
      <Rect width={shape.w} height={shape.h} fill={shape.color} shadowColor="rgba(20,20,19,.16)" shadowBlur={10} shadowOffsetY={3} cornerRadius={4} />
      <Text
        text={shape.text}
        x={12}
        y={12}
        width={shape.w - 24}
        height={shape.h - 24}
        fontSize={shape.fontSize}
        fontFamily={FONT}
        fontStyle={fontStyleOf(shape)}
        textDecoration={shape.underline ? 'underline' : ''}
        align={shape.align}
        fill="#141413"
        lineHeight={1.35}
        wrap="word"
        ellipsis
      />
    </>
  )
}

/** ロック中の印(右上の小さな鍵) */
function LockBadge({ shape }: { shape: Shape }): JSX.Element | null {
  if (!shape.locked) return null
  const w = shape.type === 'arrow' ? Math.max(shape.dx, 0) : shape.w
  return <Text text="🔒" x={w - 18} y={-20} fontSize={14} listening={false} />
}

function ImageView({ shape }: { shape: ImageShape }): JSX.Element {
  const img = useImage(shape.src)
  if (!img) {
    return (
      <>
        <Rect width={shape.w} height={shape.h} fill="#f3f4f6" stroke="#d9dde3" dash={[6, 4]} />
        <Text text={shape.name || '画像'} width={shape.w} height={shape.h} align="center" verticalAlign="middle" fontFamily={FONT} fontSize={12} fill="#6f6d64" />
      </>
    )
  }
  return <KImage image={img} width={shape.w} height={shape.h} crop={shape.crop ? { x: shape.crop.x, y: shape.crop.y, width: shape.crop.w, height: shape.crop.h } : undefined} />
}

/** 表: 罫線とセル文字。セルには cellId 属性を付けてダブルクリックで編集できるようにする */
function TableView({ shape }: { shape: TableShape }): JSX.Element {
  const xs = [0]
  for (const w of shape.colWidths) xs.push(xs[xs.length - 1]! + w)
  const ys = [0]
  for (const h of shape.rowHeights) ys.push(ys[ys.length - 1]! + h)
  const W = xs[xs.length - 1]!
  const H = ys[ys.length - 1]!
  return (
    <>
      <Rect width={W} height={H} fill="#fffefb" stroke={shape.color} strokeWidth={1.2} />
      {shape.headerRow && shape.rowHeights[0] !== undefined && <Rect width={W} height={shape.rowHeights[0]} fill="#f3f1ea" listening={false} />}
      {xs.slice(1, -1).map((x, i) => (
        <Line key={`v${i}`} points={[x, 0, x, H]} stroke={shape.color} strokeWidth={0.8} listening={false} />
      ))}
      {ys.slice(1, -1).map((y, i) => (
        <Line key={`h${i}`} points={[0, y, W, y]} stroke={shape.color} strokeWidth={0.8} listening={false} />
      ))}
      {shape.cells.map((row, r) =>
        row.map((text, c) => (
          <Text
            key={`${r}-${c}`}
            x={xs[c]! + 6}
            y={ys[r]! + 4}
            width={Math.max(1, (shape.colWidths[c] ?? 0) - 12)}
            height={Math.max(1, (shape.rowHeights[r] ?? 0) - 8)}
            text={text}
            fontSize={shape.fontSize}
            fontFamily={FONT}
            fontStyle={shape.headerRow && r === 0 ? 'bold' : 'normal'}
            fill="#141413"
            verticalAlign="middle"
            wrap="word"
            ellipsis
            cellR={r}
            cellC={c}
          />
        ))
      )}
    </>
  )
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
        fill={cancelled ? '#f3f1ea' : '#fdf8ee'}
        stroke={urgent ? '#b5462b' : cancelled ? '#d6d3c6' : '#dfcaa4'}
        strokeWidth={urgent ? 2 : 1}
        cornerRadius={6}
        shadowColor="rgba(20,20,19,.10)"
        shadowBlur={8}
        shadowOffsetY={2}
        opacity={cancelled ? 0.7 : 1}
      />
      {urgent && <Rect x={0} y={0} width={6} height={h} fill="#b5462b" cornerRadius={[6, 0, 0, 6]} />}
      <Text text={head} x={12} y={10} width={w - 80} fontSize={14} fontStyle="bold" fontFamily={DISPLAY} fill="#141413" ellipsis wrap="none" />
      {s.no && s.title && s.title !== '検査依頼' && (
        <Text text={s.title} x={12} y={27} width={w - 80} fontSize={10} fontFamily={FONT} fill="#6f6d64" ellipsis wrap="none" />
      )}
      {badges && <Text text={badges} x={10} y={h - 38} width={w - 20} fontSize={10} fontFamily={FONT} fill="#5f7a45" ellipsis wrap="none" />}
      <Rect x={w - 66} y={9} width={56} height={20} fill={badge} cornerRadius={10} />
      <Text text={status} x={w - 66} y={9} width={56} height={20} align="center" verticalAlign="middle" fontSize={11} fontFamily={FONT} fill="#141413" />
      <Text text="部門" x={10} y={rowY[0]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#141413" />
      <Text text={s.dept || '-'} x={50} y={rowY[0]} width={w - 60} fontSize={12} fontFamily={FONT} fill="#514f47" ellipsis wrap="none" />
      <Text text="品番" x={10} y={rowY[1]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#141413" />
      <Text text={s.partNo || '-'} x={50} y={rowY[1]} width={w - 60} fontSize={12} fontFamily={FONT} fill="#514f47" ellipsis wrap="none" />
      <Text text="ロット" x={10} y={rowY[2]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#141413" />
      <Text text={s.lot || '-'} x={50} y={rowY[2]} width={70} fontSize={12} fontFamily={FONT} fill="#514f47" ellipsis wrap="none" />
      <Text text="数量" x={126} y={rowY[2]} fontSize={12} fontStyle="bold" fontFamily={FONT} fill="#141413" />
      <Text text={s.qty || '-'} x={160} y={rowY[2]} width={w - 170} fontSize={12} fontFamily={FONT} fill="#514f47" ellipsis wrap="none" />
      <Text text={s.requester || '(依頼者未設定)'} x={10} y={h - 20} width={w / 2} fontSize={10} fontFamily={FONT} fill="#6f6d64" ellipsis wrap="none" />
      <Text text={s.requestedAt} x={w / 2} y={h - 20} width={w / 2 - 10} align="right" fontSize={10} fontFamily={FONT} fill="#6f6d64" />
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
