import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { shapeBounds, type BoardEditor } from './editor'
import { useEditorSnapshot } from './hooks'

const W = 180
const H = 120
const COLOR: Record<string, string> = { 'request-card': '#d97757', image: '#6a9bcc', frame: '#b0aea5', note: '#e2c66a', draw: '#141413', text: '#6f6d64', rect: '#5f7a45', ellipse: '#5f7a45', arrow: '#141413' }

/** ミニマップ: 現在のページ全体と表示範囲。クリック・ドラッグで移動 */
export function Minimap({ editor }: { editor: BoardEditor }): JSX.Element | null {
  const snap = useEditorSnapshot(editor)
  const ref = useRef<HTMLCanvasElement>(null)
  const shapes = snap.shapes.filter((s) => !(s.type === 'request-card' && s.archived))
  const vp = editor.getViewport()
  const view = { x: -snap.camera.x / snap.camera.scale, y: -snap.camera.y / snap.camera.scale, w: vp.w / snap.camera.scale, h: vp.h / snap.camera.scale }
  // 図形全体と表示範囲を含む領域を縮尺の基準にする
  let x0 = view.x
  let y0 = view.y
  let x1 = view.x + view.w
  let y1 = view.y + view.h
  for (const s of shapes) {
    const b = shapeBounds(s)
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  const pad = 40
  x0 -= pad
  y0 -= pad
  x1 += pad
  y1 += pad
  const k = Math.min(W / (x1 - x0), H / (y1 - y0))
  const ox = (W - (x1 - x0) * k) / 2
  const oy = (H - (y1 - y0) * k) / 2
  const toMini = (x: number, y: number) => ({ x: ox + (x - x0) * k, y: oy + (y - y0) * k })

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    c.width = W * dpr
    c.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    for (const s of shapes) {
      const b = shapeBounds(s)
      const p = toMini(b.x, b.y)
      ctx.fillStyle = COLOR[s.type] ?? '#b0aea5'
      ctx.globalAlpha = s.type === 'frame' ? 0.25 : 0.8
      ctx.fillRect(p.x, p.y, Math.max(2, b.w * k), Math.max(2, b.h * k))
    }
    ctx.globalAlpha = 1
    const v = toMini(view.x, view.y)
    ctx.strokeStyle = '#d97757'
    ctx.lineWidth = 1.5
    ctx.strokeRect(v.x, v.y, view.w * k, view.h * k)
    ctx.fillStyle = 'rgba(217,119,87,0.08)'
    ctx.fillRect(v.x, v.y, view.w * k, view.h * k)
  })

  if (shapes.length === 0) return null

  const moveTo = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const px = x0 + (mx - ox) / k
    const py = y0 + (my - oy) / k
    editor.setCamera({ x: vp.w / 2 - px * snap.camera.scale, y: vp.h / 2 - py * snap.camera.scale })
  }
  return (
    <canvas
      ref={ref}
      className="minimap"
      style={{ width: W, height: H }}
      data-testid="minimap"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        moveTo(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) moveTo(e)
      }}
    />
  )
}
