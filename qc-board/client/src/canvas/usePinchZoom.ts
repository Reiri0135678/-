import type React from 'react'
import { useRef } from 'react'
import type { BoardEditor } from './editor'
import type { Point } from './types'

/**
 * タッチ 2 本指のピンチズーム・パン。コンテナの capture フェーズに付ける。
 * pinching は 2 本指操作中に true(ステージ側のポインタ処理を止めるために使う)
 */
export function usePinchZoom(
  editor: BoardEditor,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onPinchStart: () => void
): { pinching: React.RefObject<boolean>; onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void } {
  const touches = useRef(new Map<number, Point>())
  const pinch = useRef<{ dist: number; center: Point; camera: { x: number; y: number; scale: number } } | null>(null)
  const pinching = useRef(false)

  const geometry = () => {
    const [p1, p2] = [...touches.current.values()]
    const el = containerRef.current!.getBoundingClientRect()
    return { dist: Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y), center: { x: (p1!.x + p2!.x) / 2 - el.left, y: (p1!.y + p2!.y) / 2 - el.top } }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      pinch.current = { ...geometry(), camera: { ...editor.getSnapshot().camera } }
      pinching.current = true
      onPinchStart()
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pz = pinch.current
    if (!pz || touches.current.size < 2) return
    const { dist, center } = geometry()
    const k = dist / Math.max(1, pz.dist)
    const scale = Math.min(8, Math.max(0.1, pz.camera.scale * k))
    // 開始時の中心が指す紙面上の点を、現在の中心に合わせる
    const pageAtStart = { x: (pz.center.x - pz.camera.x) / pz.camera.scale, y: (pz.center.y - pz.camera.y) / pz.camera.scale }
    editor.setCamera({ scale, x: center.x - pageAtStart.x * scale, y: center.y - pageAtStart.y * scale })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) {
      pinch.current = null
      pinching.current = false
    }
  }
  return { pinching, onPointerDown, onPointerMove, onPointerUp }
}
