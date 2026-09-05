import type React from 'react'
import { useCallback, useEffect } from 'react'
import { CLIPBOARD_MARK } from '@shared/shapes'
import type { BoardEditor } from './editor'
import { newId } from './editor'
import type { Point } from './types'
import { loadImageSize } from './useImage'
import { expandFiles } from './pdf'

/** 画像を 1 枚アップロードして図形として置く(長辺 600px まで縮小表示) */
export async function addImageFile(editor: BoardEditor, file: File, at: Point): Promise<void> {
  if (editor.isReadonly() || !file.type.startsWith('image/')) return
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const id = `${newId()}${ext}`.replace(/[^A-Za-z0-9_.-]/g, '_')
  const r = await fetch(`/api/uploads/${id}`, { method: 'PUT', body: file })
  if (!r.ok) {
    console.error('upload failed', r.status)
    return
  }
  const src = `/api/uploads/${id}`
  let w = 400
  let h = 300
  try {
    const nat = await loadImageSize(src)
    const k = Math.min(1, 600 / Math.max(nat.w, nat.h))
    w = Math.round(nat.w * k)
    h = Math.round(nat.h * k)
  } catch {
    /* サイズ不明なら既定 */
  }
  const s = editor.createShape({ type: 'image', x: at.x - w / 2, y: at.y - h / 2, w, h, src, name: file.name })
  editor.select(s.id)
}

/** 画像・PDF をまとめて取り込む(PDF はページごとに画像化)。少しずつずらして置く */
export async function addFiles(editor: BoardEditor, files: File[], at: Point): Promise<void> {
  const imgs = await expandFiles(files)
  for (let i = 0; i < imgs.length; i++) await addImageFile(editor, imgs[i]!, { x: at.x + i * 40, y: at.y + i * 40 })
}

/**
 * ドロップと貼り付けによる取り込み。
 * 貼り付けは、画像/PDF → 図形として置く、図形データ → そのまま貼る、ただの文字 → 文字図形にする
 */
export function useImageImport(editor: BoardEditor, containerRef: React.RefObject<HTMLDivElement | null>, size: { w: number; h: number }): { onDrop: (e: React.DragEvent) => void } {
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const at = editor.screenToPage({ x: e.clientX - r.left, y: e.clientY - r.top })
      void addFiles(editor, Array.from(e.dataTransfer.files), at)
    },
    [editor, containerRef]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
      const center = editor.screenToPage({ x: size.w / 2, y: size.h / 2 })
      if (files.length > 0) {
        e.preventDefault()
        void addFiles(editor, files, center)
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.includes(`"mark":"${CLIPBOARD_MARK}"`)) {
        e.preventDefault()
        void editor.paste(undefined, text)
      } else if (text.trim() && !editor.isReadonly()) {
        // ただの文字は文字図形として貼る
        e.preventDefault()
        const sh = editor.createShape({ type: 'text', x: center.x - 100, y: center.y - 14, w: Math.min(600, Math.max(200, text.length * 10)), text: text.trim() })
        editor.select(sh.id)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [editor, size])

  return { onDrop }
}
