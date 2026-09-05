import type { JSX } from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import type { Collaborator } from './editor'

/** 他の参加者のカーソルと名前。ズームに関係なく同じ大きさで表示する */
export function Cursors({ collaborators, scale }: { collaborators: Collaborator[]; scale: number }): JSX.Element {
  const k = 1 / scale
  return (
    <>
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
