import { useEffect, useState } from 'react'

const cache = new Map<string, HTMLImageElement>()

/** 画像を読み込む(同一オリジンの /api/uploads を想定。Cookie で認可される) */
export function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() => cache.get(src) ?? null)
  useEffect(() => {
    if (!src) return
    const cached = cache.get(src)
    if (cached) {
      setImg(cached)
      return
    }
    const el = new Image()
    el.onload = () => {
      cache.set(src, el)
      setImg(el)
    }
    el.onerror = () => setImg(null)
    el.src = src
  }, [src])
  return img
}

export function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight })
    el.onerror = reject
    el.src = src
  })
}
