import type Konva from 'konva'
import { todayString, type Shape } from '@shared/shapes'
import type { BoardEditor } from './editor'
import { boundsOf } from './geometry'

/**
 * PNG 書き出し。対象が画面に収まるよう一時的にカメラを合わせ、描画層だけを画像化して保存する。
 * 副作用: 一瞬カメラが動く(書き出し後に戻す)。追従中でも解除しない
 */
export async function exportPng(editor: BoardEditor, layer: Konva.Layer, shapes: Shape[], viewport: { w: number; h: number }, label: string): Promise<void> {
  const b = boundsOf(shapes)
  if (!b) return
  const pad = 24
  const prev = editor.getSnapshot().camera
  const scale = Math.min(4, Math.max(0.05, Math.min((viewport.w - pad * 2) / b.w, (viewport.h - pad * 2) / b.h)))
  editor.setCamera({ scale, x: pad - b.x * scale, y: pad - b.y * scale }, { keepFollow: true })
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const dataUrl = layer.toDataURL({ x: pad - 4, y: pad - 4, width: Math.ceil(b.w * scale) + 8, height: Math.ceil(b.h * scale) + 8, pixelRatio: Math.min(4, 2 / scale) })
  editor.setCamera(prev, { keepFollow: true })
  // data URL だとファイル名が付かないブラウザがあるので Blob にしてから保存
  const blob = await (await fetch(dataUrl)).blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${label}_${todayString()}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
