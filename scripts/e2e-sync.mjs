// 2ブラウザで同じボードを開き、片方で置いた図形がもう片方に同期されることを確認する。
// 前提: `npm run build` 済み。サーバーはこのスクリプトが起動・停止する。
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const PORT = 3123
const BASE = `http://localhost:${PORT}`
const dataDir = mkdtempSync(join(process.env.SCRATCH_DIR ?? tmpdir(), 'qc-e2e-'))
const shotDir = process.env.SHOT_DIR ?? dataDir

const server = spawn('npx', ['tsx', 'server/src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), QC_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true
})
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))

const waitFor = async (fn, ms = 20000) => {
  const t0 = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 200))
  }
}

let exitCode = 1
try {
  await waitFor(() => fetch(`${BASE}/api/rooms`).then((r) => r.ok))
  const rooms = await (await fetch(`${BASE}/api/rooms`)).json()
  const room = rooms[0]
  console.log('[e2e] room', room)

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox']
  })
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message))
    await page.goto(`${BASE}/`)
    await page.fill('input[placeholder="例: 山田"]', name)
    await page.click(`.rooms button:has-text("${room.name}")`)
    await page.waitForFunction(() => !!window.__qcEditor)
    await page.waitForFunction(() => document.querySelector('.dot--online') !== null)
    return page
  }

  const a = await open('山田')
  const b = await open('佐藤')

  // A が依頼カードを置く
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.createShapes([
      { type: 'request-card', x: 100, y: 100, props: { partNo: 'E2E-001', lot: 'L1', qty: '3', status: '受付' } }
    ])
    ed.zoomToFit({ animation: { duration: 0 } })
  })
  // B に届く
  const seen = await waitFor(() =>
    b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.partNo === 'E2E-001'))
  )
  console.log('[e2e] A→B request-card synced:', seen)

  // B が付箋を置く → A に届く
  await b.evaluate(() => {
    window.__qcEditor.createShapes([{ type: 'note', x: 100, y: 300 }])
    window.__qcEditor.zoomToFit({ animation: { duration: 0 } })
  })
  const seen2 = await waitFor(() => a.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'note')))
  console.log('[e2e] B→A note synced:', seen2)

  // A がサイドバーでカードを編集 → B に届く
  await a.evaluate(() => {
    const ed = window.__qcEditor
    const card = ed.getCurrentPageShapes().find((s) => s.type === 'request-card')
    ed.select(card.id)
  })
  await a.waitForSelector('[data-testid="card-editor"]')
  await a.selectOption('[data-field="status"]', '検査中')
  await a.fill('[data-field="lot"]', 'L-EDITED')
  const edited = await waitFor(() =>
    b.evaluate(() =>
      window.__qcEditor
        .getCurrentPageShapes()
        .some((s) => s.type === 'request-card' && s.props.status === '検査中' && s.props.lot === 'L-EDITED')
    )
  )
  console.log('[e2e] A sidebar edit → B synced:', edited)

  // サイドバーの「+ 依頼」で作ったカードに依頼者と依頼日が入る
  await b.click('[data-testid="add-card"]')
  const stamped = await waitFor(() =>
    b.evaluate(() =>
      window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.requester === '佐藤' && /^\d{4}-\d{2}-\d{2}$/.test(s.props.requestedAt))
    )
  )
  console.log('[e2e] add-card stamps requester/date:', stamped)
  const rows = await waitFor(async () => {
    const n = await a.locator('[data-testid="card-row"]').count()
    return n >= 2 ? n : null
  })
  console.log('[e2e] rows in A list:', rows)

  // B が画像をドロップ → サーバーに保存され A にも画像が出る
  await b.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 120
    c.height = 80
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#2563eb'
    ctx.fillRect(0, 0, 120, 80)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'drawing.png', { type: 'image/png' }))
    const target = document.querySelector('.tl-container')
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 700, clientY: 500 }))
  })
  const imgSrc = await waitFor(() =>
    a.evaluate(() => {
      const ed = window.__qcEditor
      const img = ed.getCurrentPageShapes().find((s) => s.type === 'image')
      if (!img?.props.assetId) return null
      const asset = ed.getAsset(img.props.assetId)
      return asset?.props.src || null
    })
  )
  const imgRes = await fetch(`${BASE}${imgSrc}`)
  console.log('[e2e] image dropped by B visible in A:', imgSrc, 'server GET', imgRes.status, imgRes.headers.get('content-length'), 'bytes')
  if (!imgRes.ok) throw new Error('uploaded image not served')

  // 相手の存在(コラボレーター)が見える
  const peers = await waitFor(() => a.evaluate(() => window.__qcEditor.getCollaborators().length))
  console.log('[e2e] peers seen by A:', peers)

  await a.evaluate(() => {
    window.__qcEditor.selectNone()
    window.__qcEditor.zoomToFit({ animation: { duration: 0 } })
  })
  await b.evaluate(() => {
    window.__qcEditor.selectNone()
    window.__qcEditor.zoomToFit({ animation: { duration: 0 } })
  })
  await a.waitForTimeout(500)
  await a.screenshot({ path: join(shotDir, 'e2e-a.png') })
  await b.screenshot({ path: join(shotDir, 'e2e-b.png') })
  await browser.close()

  // 永続化: 最後の接続が切れた後にスナップショットが書かれる
  const { readdirSync } = await import('node:fs')
  const files = await waitFor(() => {
    const f = readdirSync(join(dataDir, 'rooms'))
    return f.some((x) => x.endsWith('.snapshot.json')) ? f : null
  })
  console.log('[e2e] persisted:', files.filter((f) => f.endsWith('.snapshot.json')))
  exitCode = 0
  console.log(`[e2e] OK  screenshots in ${shotDir}`)
} catch (e) {
  console.error('[e2e] FAILED', e)
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill()
  }
}
process.exit(exitCode)
