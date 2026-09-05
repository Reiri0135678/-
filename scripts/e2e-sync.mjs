// 2ブラウザで同じボードを開き、同期・編集・図面紐付け・一覧・kintone(モック)・権限を確認する。
// 前提: `npm run build` 済み。サーバーはこのスクリプトが起動・停止する(パスワード認証 + kintone モック)。
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const PORT = 3123
const BASE = `http://localhost:${PORT}`
const dataDir = mkdtempSync(join(process.env.SCRATCH_DIR ?? tmpdir(), 'qc-e2e-'))
const shotDir = process.env.SHOT_DIR ?? dataDir
const usersFile = join(dataDir, 'users.json')

for (const [name, pw, role] of [['山田', 'pw-yamada', 'member'], ['佐藤', 'pw-sato', 'member'], ['閲覧者', 'pw-view', 'viewer']]) {
  const r = spawnSync('node', ['scripts/add-user.mjs', name, pw, role], { env: { ...process.env, QC_USERS_FILE: usersFile } })
  if (r.status !== 0) throw new Error(`add-user failed: ${r.stderr}`)
}

const server = spawn('npx', ['tsx', 'server/src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), QC_DATA_DIR: dataDir, QC_USERS_FILE: usersFile, KINTONE_MOCK: '1', QC_EMBED_KEY: 'e2e-embed-key-0123456789' },
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
const cookieOf = async (page) => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
const ok = (label, cond) => {
  console.log(`[e2e] ${cond ? 'ok ' : 'NG '} ${label}`)
  if (!cond) throw new Error(`failed: ${label}`)
}

let exitCode = 1
try {
  await waitFor(() => fetch(`${BASE}/api/auth/mode`).then((r) => r.ok))
  ok('未ログインの /api/rooms は 401', (await fetch(`${BASE}/api/rooms`)).status === 401)
  ok('認証モードは password', (await (await fetch(`${BASE}/api/auth/mode`)).json()).mode === 'password')

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
  const open = async (name, pw) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message))
    await page.goto(`${BASE}/`)
    await page.fill('input[placeholder="例: 山田"]', name)
    await page.fill('input[type="password"]', pw)
    await page.click('button[type="submit"]')
    await page.waitForSelector('.rooms button')
    await page.click('.rooms button >> nth=0')
    await page.waitForFunction(() => !!window.__qcEditor)
    await page.waitForFunction(() => document.querySelector('.dot--online') !== null)
    return page
  }

  // 間違ったパスワード
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`)
    await page.fill('input[placeholder="例: 山田"]', '山田')
    await page.fill('input[type="password"]', 'wrong')
    await page.click('button[type="submit"]')
    await page.waitForSelector('.error')
    ok('誤パスワードはエラー表示', true)
    await ctx.close()
  }

  const a = await open('山田', 'pw-yamada')
  const b = await open('佐藤', 'pw-sato')

  // A が依頼カードを置く → B に届く
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.createShapes([{ type: 'request-card', x: 100, y: 100, props: { partNo: 'E2E-001', lot: 'L1', qty: '3', status: '受付' } }])
  })
  ok('A→B カード同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.partNo === 'E2E-001'))))

  // A がサイドバーでカードを編集 → B に届く
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.select(ed.getCurrentPageShapes().find((s) => s.type === 'request-card').id)
  })
  await a.waitForSelector('[data-testid="card-editor"]')
  await a.selectOption('[data-testid="card-editor"] [data-field="status"]', '検査中')
  await a.fill('[data-testid="card-editor"] [data-field="lot"]', 'L-EDITED')
  ok('A サイドバー編集 → B 同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.status === '検査中' && s.props.lot === 'L-EDITED'))))

  // B が一覧の「+ 依頼」で作成 → 依頼者と日付が入る
  await b.click('[data-testid="sheet-add"]')
  ok('+ 依頼 で依頼者・依頼日が自動記録', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.requester === '佐藤' && /^\d{4}-\d{2}-\d{2}$/.test(s.props.requestedAt)))))

  // 一覧(スプレッドシート): 2 行、セル編集が B に同期、検索で絞り込み
  ok('A の一覧に 2 行', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) >= 2 ? 2 : null))) === 2)
  const firstPart = a.locator('[data-testid="sheet-row"] input[data-col="partNo"]').first()
  await firstPart.fill('SHEET-EDIT')
  ok('一覧セル編集 → B 同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.partNo === 'SHEET-EDIT'))))
  await a.fill('[data-testid="sheet-search"]', 'SHEET-EDIT')
  ok('検索で 1 行に絞り込み', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
  await a.fill('[data-testid="sheet-search"]', '')
  await a.selectOption('[data-testid="sheet-filter"]', '検査中')
  ok('状態フィルタで 1 行', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
  await a.selectOption('[data-testid="sheet-filter"]', '')

  // CSV: ダウンロードイベントが発生し内容に見出しが含まれる
  const [download] = await Promise.all([a.waitForEvent('download'), a.click('[data-testid="sheet-csv"]')])
  const csvPath = await download.path()
  const { readFileSync } = await import('node:fs')
  const csv = readFileSync(csvPath, 'utf8')
  ok('CSV に見出しと行がある', csv.includes('状態') && csv.includes('SHEET-EDIT'))

  // B が画像をドロップ → サーバー保存、A のギャラリーに出る
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
    document.querySelector('.tl-container').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 900, clientY: 500 }))
  })
  const imgSrc = await waitFor(() => a.evaluate(() => {
    const ed = window.__qcEditor
    const img = ed.getCurrentPageShapes().find((s) => s.type === 'image')
    return img?.props.assetId ? ed.getAsset(img.props.assetId)?.props.src : null
  }))
  ok('画像がサーバーに保存され A に見える', imgSrc.startsWith('/api/uploads/'))
  ok('画像はログイン無しでは取得不可', (await fetch(`${BASE}${imgSrc}`)).status === 401)
  await a.waitForSelector('[data-testid="gallery"] .gallery__item')
  ok('A のギャラリーに 1 件', (await a.locator('[data-testid="gallery"] .gallery__item').count()) === 1)

  // 図面の紐付け: A がカードを選び「図面を紐付け」→ ギャラリーをクリック
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.select(ed.getCurrentPageShapes().find((s) => s.type === 'request-card' && s.props.partNo === 'SHEET-EDIT').id)
  })
  await a.click('[data-testid="start-link"]')
  await a.click('[data-testid="gallery"] .gallery__item >> nth=0')
  await a.waitForSelector('[data-testid="linked-images"] li')
  ok('カードに図面が紐付く(B でも見える)', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().some((s) => s.type === 'request-card' && s.props.linkedShapeIds.length === 1))))

  // kintone(モック)へ送信 → レコード番号がカードに書き戻され B にも届く
  await a.click('[data-testid="sheet-kintone"]')
  const msg = await (await a.waitForSelector('[data-testid="sync-msg"]')).textContent()
  ok(`kintone 送信結果: ${msg}`, /新規 2 件/.test(msg))
  ok('kintone レコード番号が B のカードに書き戻る', await waitFor(() => b.evaluate(() => window.__qcEditor.getCurrentPageShapes().filter((s) => s.type === 'request-card').every((s) => /^\d+$/.test(s.props.kintoneRecordId)))))
  await a.click('[data-testid="sheet-kintone"]')
  const msg2 = await waitFor(async () => {
    const t = await a.locator('[data-testid="sync-msg"]').textContent()
    return /更新 2 件/.test(t) ? t : null
  })
  ok(`2 回目は更新: ${msg2}`, true)

  // 相手の存在
  ok('A に相手が見える', (await waitFor(() => a.evaluate(() => window.__qcEditor.getCollaborators().length))) === 1)

  // 閲覧者: 読み取り専用で接続され、書き込みが通らない
  const v = await open('閲覧者', 'pw-view')
  ok('閲覧者は readonly', await waitFor(() => v.evaluate(() => window.__qcEditor.getIsReadonly())))
  ok('閲覧者のヘッダーに「閲覧のみ」', (await v.locator('.badge--warn').count()) === 1)
  ok('閲覧者には + 依頼 が無い', (await v.locator('[data-testid="sheet-add"]').count()) === 0)
  await v.context().close()

  // 埋め込み連携(Mission Bridge 想定)
  {
    const rooms = await (await fetch(`${BASE}/api/rooms`, { headers: { cookie: await cookieOf(a) } })).json()
    const boardId = rooms[0].id
    const bad = await fetch(`${BASE}/api/auth/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'wrong', name: '田中' }) })
    ok('埋め込み: 鍵違いは 401', bad.status === 401)
    const good = await fetch(`${BASE}/api/auth/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'e2e-embed-key-0123456789', name: '田中', role: 'member' }) })
    ok('埋め込み: トークン発行', good.ok)
    const { token } = await good.json()

    // Electron の WebContentsView / <webview> と同じくトップレベルで開き、preload 相当の initScript で postMessage を受け取る
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript(() => {
      window.__events = window.__events ?? []
      addEventListener('message', (e) => {
        if (e.data && e.data.source === 'qc-board') window.__events.push(e.data)
      })
    })
    const host = await ctx.newPage()
    await host.goto(`${BASE}/embed?token=${token}&board=${boardId}`)
    await host.waitForFunction(() => !!window.__qcEditor && document.querySelector('.dot--online'))
    ok('埋め込み: トークンでボードに入れる', (await host.locator('.app__meta').textContent()).includes('田中'))
    ok('埋め込み: 縮小ヘッダー(埋め込みモード)', (await host.locator('.app[data-embed="true"]').count()) === 1)
    const events = await waitFor(async () => {
      const ev = await host.evaluate(() => window.__events.map((e) => e.event))
      return ev.includes('ready') && ev.includes('board-opened') ? ev : null
    })
    ok(`埋め込み: ホストがイベント受信 (${[...new Set(events)].join(',')})`, true)
    await host.evaluate(() => {
      const ed = window.__qcEditor
      ed.select(ed.getCurrentPageShapes().find((s) => s.type === 'request-card').id)
    })
    ok('埋め込み: カード選択がホストへ通知', await waitFor(() => host.evaluate(() => window.__events.some((e) => e.event === 'card-selected' && e.shapeId))))
    await host.goto(`${BASE}/`)
    await host.waitForSelector('.rooms button')
    ok('埋め込み: 一覧画面でもログアウトが出ない', (await host.locator('.who .link').count()) === 0)
    const reuse = await fetch(`${BASE}/api/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
    ok('埋め込み: トークンは 1 回限り', reuse.status === 401)
    await ctx.close()
  }

  for (const p of [a, b]) {
    await p.evaluate(() => {
      window.__qcEditor.selectNone()
      window.__qcEditor.zoomToFit({ animation: { duration: 0 } })
    })
  }
  await a.waitForTimeout(500)
  await a.screenshot({ path: join(shotDir, 'e2e-a.png') })
  await b.screenshot({ path: join(shotDir, 'e2e-b.png') })
  await browser.close()

  // 永続化
  const files = await waitFor(() => {
    const f = readdirSync(join(dataDir, 'rooms'))
    return f.some((x) => x.endsWith('.snapshot.json')) ? f : null
  })
  ok(`永続化: ${files.filter((f) => f.endsWith('.snapshot.json'))}`, true)
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
