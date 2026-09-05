import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Circle, Group, Line } from 'react-konva'
import type { Collaborator } from './editor'

/** レーザーポインターの軌跡(自分と相手)。古い点から薄くなり、1 秒で消える */
export function LaserTrails({ collaborators, mine, myColor, scale }: { collaborators: Collaborator[]; mine: number[]; myColor: string; scale: number }): JSX.Element {
  // 相手の軌跡は時刻で消す(再描画のために時計を回す)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((v) => v + 1), 120)
    return () => window.clearInterval(id)
  }, [])
  const now = Date.now()
  const trails: Array<{ key: string; points: number[]; color: string; age: number }> = []
  if (mine.length >= 4) trails.push({ key: 'me', points: mine, color: myColor, age: 0 })
  for (const c of collaborators) {
    if (c.laser && c.laser.points.length >= 4 && now - c.laser.ts < 1200) trails.push({ key: String(c.clientId), points: c.laser.points, color: c.color, age: now - c.laser.ts })
  }
  return (
    <>
      {trails.map((t) => {
        const alpha = Math.max(0, 1 - t.age / 1200)
        const head = { x: t.points[t.points.length - 2]!, y: t.points[t.points.length - 1]! }
        return (
          <Group key={t.key} listening={false}>
            <Line points={t.points} stroke={t.color} strokeWidth={6 / scale} opacity={0.5 * alpha} lineCap="round" lineJoin="round" tension={0.4} shadowColor={t.color} shadowBlur={12 / scale} />
            <Circle x={head.x} y={head.y} radius={(7 / scale) * (0.6 + 0.4 * alpha)} fill={t.color} opacity={0.9 * alpha} shadowColor={t.color} shadowBlur={14 / scale} />
          </Group>
        )
      })}
    </>
  )
}
