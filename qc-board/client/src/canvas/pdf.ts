/**
 * PDF 図面をページごとに PNG 画像へ変換する(ブラウザ側、pdf.js を遅延読込)。
 * サーバーにネイティブ依存を増やさないため、変換はクライアントで行う。
 */
const MAX_PAGES = 10
const TARGET_WIDTH = 1600

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function pdfToImages(file: File): Promise<File[]> {
  // legacy ビルド: 古い Chrome/Edge 向けのポリフィル同梱版(社内 PC のブラウザ更新遅れに備える)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const base = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []
  const n = Math.min(doc.numPages, MAX_PAGES)
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i)
    const v1 = page.getViewport({ scale: 1 })
    const scale = Math.min(3, TARGET_WIDTH / v1.width)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (blob) out.push(new File([blob], `${base}${n > 1 ? `_p${i}` : ''}.png`, { type: 'image/png' }))
  }
  await doc.cleanup()
  return out
}

/** 画像はそのまま、PDF はページ画像に展開して返す */
export async function expandFiles(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    if (isPdf(f)) out.push(...(await pdfToImages(f)))
    else if (f.type.startsWith('image/')) out.push(f)
  }
  return out
}
