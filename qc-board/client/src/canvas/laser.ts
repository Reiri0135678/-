import type { Awareness } from 'y-protocols/awareness'
import type { Point } from './types'

/** レーザーポインターの軌跡を awareness で配信する(30ms ごとにまとめ、直近 30 点だけ) */
export class LaserPublisher {
  private pts: number[] = []
  private timer: number | null = null
  constructor(private readonly awareness: Awareness) {}

  move(p: Point | null): void {
    if (!p) {
      this.pts = []
      if (this.timer !== null) {
        window.clearTimeout(this.timer)
        this.timer = null
      }
      this.awareness.setLocalStateField('laser', null)
      return
    }
    this.pts.push(p.x, p.y)
    if (this.pts.length > 60) this.pts.splice(0, this.pts.length - 60)
    if (this.timer !== null) return
    this.timer = window.setTimeout(() => {
      this.timer = null
      this.awareness.setLocalStateField('laser', { points: [...this.pts], ts: Date.now() })
    }, 30)
  }
}
