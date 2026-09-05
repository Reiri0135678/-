import type { JSX } from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import type { Shape } from '@shared/shapes'
import type { Collaborator } from './types'
import { shapeBounds } from './geometry'
import { ShapeView } from './shapes/ShapeView'

/** 他の参加者のカーソルと名前。ズームに関係なく同じ大きさで表示する */
export function Cursors({ collaborators, scale, byId }: { collaborators: Collaborator[]; scale: number; byId: ReadonlyMap<string, Shape> }): JSX.Element {
  const k = 1 / scale
  return (
    <>
      {collaborators.flatMap((c) =>
        c.selection
          .map((id) => byId.get(id))
          .filter((s): s is Shape => !!s)
          .map((s, i) => {
            const b = shapeBounds(s)
            return (
              <Group key={`sel-${c.clientId}-${s.id}`} listening={false}>
                <Rect x={b.x - 3 * k} y={b.y - 3 * k} width={b.w + 6 * k} height={b.h + 6 * k} stroke={c.color} strokeWidth={1.5 * k} dash={[6 * k, 4 * k]} cornerRadius={4 * k} />
                {i === 0 && (
                  <Group x={b.x} y={b.y - 22 * k} scaleX={k} scaleY={k}>
                    <Rect width={c.name.length * 12 + 12} height={18} fill={c.color} cornerRadius={4} opacity={0.9} />
                    <Text x={6} y={3} text={c.name} fontSize={11} fill="#fff" fontFamily="system-ui, sans-serif" />
                  </Group>
                )}
              </Group>
            )
          })
      )}
      {collaborators
        .filter((c) => c.draft)
        .map((c) => (
          <ShapeView key={`draft-${c.clientId}`} shape={{ ...c.draft!, id: `draft-${c.clientId}` }} draft draggable={false} />
        ))}
      {collaborators
        .filter((c) => c.cursor)
        .map((c) => (
          <Group key={c.clientId} x={c.cursor!.x} y={c.cursor!.y} scaleX={k} scaleY={k} listening={false}>
            <Line points={[0, 0, 0, 16, 4, 12, 7, 19, 10, 18, 7, 11, 12, 11]} closed fill={c.color} stroke="#fffefb" strokeWidth={1} />
            <Rect x={14} y={14} width={c.name.length * 12 + 12} height={20} fill={c.color} cornerRadius={6} />
            <Text x={20} y={17} text={c.name} fontSize={12} fill="#fff" fontFamily="system-ui, sans-serif" />
          </Group>
        ))}
    </>
  )
}
