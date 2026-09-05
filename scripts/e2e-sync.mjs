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

for (const [name, pw, role] of [['山田', 'pw-yamada', 'member'], ['佐藤', 'pw-sato', 'member'], ['閲覧者', 'pw-view', 'viewer'], ['管理者', 'pw-admin', 'admin']]) {
  const r = spawnSync('node', ['scripts/add-user.mjs', name, pw, role], { env: { ...process.env, QC_USERS_FILE: usersFile } })
  if (r.status !== 0) throw new Error(`add-user failed: ${r.stderr}`)
}

// 通知の受け口(Teams/Slack の Incoming Webhook の代わり)
import { createServer } from 'node:http'
const received = []
const hookServer = createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    try { received.push(JSON.parse(body)) } catch {}
    res.end('ok')
  })
})
await new Promise((r) => hookServer.listen(3124, r))

const server = spawn('npx', ['tsx', 'server/src/index.ts'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    QC_DATA_DIR: dataDir,
    QC_USERS_FILE: usersFile,
    KINTONE_MOCK: '1',
    QC_EMBED_KEY: 'e2e-embed-key-0123456789',
    QC_NOTIFY_WEBHOOK: 'http://localhost:3124/hook',
    QC_BACKUP_DIR: `${dataDir}-backups`,
    QC_BACKUP_INTERVAL_HOURS: '0'
  },
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
const loginCookie = async (name, password) => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }) })
  if (!r.ok) throw new Error(`login ${name} failed`)
  return r.headers.get('set-cookie').split(';')[0]
}
const cookieOf = async (page) => (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
// Konva の当たり判定用キャンバスは次の描画フレームで更新されるので、evaluate で図形を変えた直後のマウス操作の前に待つ
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const ok = (label, cond) => {
  console.log(`[e2e] ${cond ? 'ok ' : 'NG '} ${label}`)
  if (!cond) throw new Error(`failed: ${label}`)
}

let exitCode = 1
try {
  await waitFor(() => fetch(`${BASE}/api/auth/mode`).then((r) => r.ok))
  ok('未ログインの /api/rooms は 401', (await fetch(`${BASE}/api/rooms`)).status === 401)
  ok('認証モードは password', (await (await fetch(`${BASE}/api/auth/mode`)).json()).mode === 'password')

  // CHROMIUM_PATH が無ければ `npx playwright-core install chromium` で入れたブラウザを使う
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
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
    window.__qcEditor.createShape({ type: 'request-card', x: 100, y: 100, partNo: 'E2E-001', lot: 'L1', qty: '3', status: '受付' })
  })
  ok('A→B カード同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.partNo === 'E2E-001'))))
  const no1 = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'request-card')?.no || null))
  ok(`サーバーが受付番号を採番 (${no1})`, /^QC-\d{4}-0001$/.test(no1))

  // B がペンで描く → A に届く(自作キャンバスの描画同期)
  await b.evaluate(() => {
    window.__qcEditor.createShape({ type: 'draw', x: 50, y: 300, w: 100, h: 40, points: [0, 0, 30, 20, 60, 5, 100, 40] })
  })
  ok('B→A ペン描画同期', await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'draw' && s.points.length === 8))))

  // A がサイドバーでカードを編集 → B に届く
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.select(ed.getShapes().find((s) => s.type === 'request-card').id)
  })
  await a.waitForSelector('[data-testid="card-editor"]')
  await a.waitForTimeout(400) // 取り消し単位(300ms)を分けるため
  await a.selectOption('[data-testid="card-editor"] [data-field="status"]', '検査中')
  await a.fill('[data-testid="card-editor"] [data-field="lot"]', 'L-EDITED')
  ok('A サイドバー編集 → B 同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.status === '検査中' && s.lot === 'L-EDITED'))))

  // 取り消し: A が Ctrl+Z するとロットが戻り、Ctrl+Shift+Z でやり直す
  await a.click('.board')
  await a.keyboard.press('Control+z')
  ok('Ctrl+Z で自分の編集が戻る', await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.lot !== 'L-EDITED'))))
  await a.keyboard.press('Control+Shift+z')
  ok('Ctrl+Shift+Z でやり直し', await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.lot === 'L-EDITED'))))

  // スナップ・矢印の吸着・描画中のリアルタイム表示
  {
    const board = await a.locator('.board').boundingBox()
    const pt = (x, y) => [board.x + x, board.y + y]
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.selectNone()
      ed.setCamera({ x: 0, y: 0, scale: 1 })
      ed.createShape({ id: 's_rectA', type: 'rect', x: 400, y: 420, w: 120, h: 80 })
      ed.createShape({ id: 's_rectB', type: 'rect', x: 700, y: 445, w: 120, h: 80 })
    })
    await a.waitForTimeout(200)
    // B を A の左端から 5px ずれた位置へドラッグ → 左端が揃う(x=400)
    await a.mouse.move(...pt(760, 485))
    await a.mouse.down()
    await a.mouse.move(...pt(700, 485), { steps: 6 })
    await a.mouse.move(...pt(465, 485), { steps: 6 })
    await a.mouse.up()
    const rb = await a.evaluate(() => window.__qcEditor.getShape('s_rectB'))
    ok(`スナップで左端が揃う (x=${rb.x})`, rb.x === 400)
    await a.evaluate(() => window.__qcEditor.updateShape('s_rectB', { x: 700, y: 445 }))

    // 矢印ツールで A の中から B の中へドラッグ → 両端が吸着し、外周まで引かれる
    await a.evaluate(() => window.__qcEditor.setTool('arrow'))
    await settle(a)
    await a.mouse.move(...pt(460, 460))
    await a.mouse.down()
    await a.mouse.move(...pt(760, 485), { steps: 8 })
    await a.mouse.up()
    const arrow = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'arrow' && s.startBind && s.endBind) || null))
    ok(`矢印が両端の図形に吸着 (${arrow.startBind.id} → ${arrow.endBind.id})`, arrow.startBind.id === 's_rectA' && arrow.endBind.id === 's_rectB' && arrow.x >= 520 && arrow.x <= 527 && arrow.x + arrow.dx >= 693 && arrow.x + arrow.dx <= 700)
    // 吸着先を動かすと矢印が追従(B 側でも同じ)
    await a.evaluate(() => window.__qcEditor.updateShape('s_rectB', { x: 700, y: 600 }))
    const moved = await waitFor(() => b.evaluate((id) => { const s = window.__qcEditor.getShape(id); return s && s.y + s.dy > 560 ? s : null }, arrow.id))
    ok('吸着先を動かすと矢印の終点が追従(相手の画面でも)', moved.y + moved.dy >= 594 && moved.y + moved.dy <= 640)
    // 吸着先を消すと吸着が外れる(矢印は残る)
    await a.evaluate(() => window.__qcEditor.deleteShapes(['s_rectB']))
    const unbound = await waitFor(() => a.evaluate((id) => { const s = window.__qcEditor.getShape(id); return s && s.endBind === null ? s : null }, arrow.id))
    ok('吸着先を削除すると吸着が外れる', !!unbound && unbound.startBind?.id === 's_rectA')
    await a.evaluate(() => window.__qcEditor.setTool('select'))

    // B がペンで描いている途中の線が A に見える
    const boardB = await b.locator('.board').boundingBox()
    await b.evaluate(() => { window.__qcEditor.setCamera({ x: 0, y: 0, scale: 1 }); window.__qcEditor.setTool('draw') })
    await settle(b)
    await b.mouse.move(boardB.x + 200, boardB.y + 300)
    await b.mouse.down()
    await b.mouse.move(boardB.x + 300, boardB.y + 350, { steps: 10 })
    await b.mouse.move(boardB.x + 400, boardB.y + 300, { steps: 10 })
    const live = await waitFor(() => a.evaluate(() => window.__qcEditor.getCollaborators().find((c) => c.draft && c.draft.type === 'draw')?.draft || null))
    ok(`描画途中の線が相手に見える (${live.points.length / 2} 点)`, live.points.length >= 8)
    await b.mouse.up()
    ok('書き終えると途中表示が消え、確定した線が届く', await waitFor(() => a.evaluate(() => !window.__qcEditor.getCollaborators().some((c) => c.draft) && window.__qcEditor.getShapes().filter((s) => s.type === 'draw').length >= 2)))
    await b.evaluate(() => window.__qcEditor.setTool('select'))
  }

  // 他人の選択範囲・文字装飾・グループ/ロック・複数ページ・コメント
  {
    // 他人の選択範囲
    await b.evaluate(() => window.__qcEditor.select('s_rectA'))
    ok('相手の選択範囲が在席情報で届く', await waitFor(() => a.evaluate(() => window.__qcEditor.getCollaborators().some((c) => c.selection.includes('s_rectA')))))
    await b.evaluate(() => window.__qcEditor.selectNone())

    // 文字装飾
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.createShape({ id: 's_text1', type: 'text', x: 100, y: 700, w: 200, h: 28, text: '装飾テスト' })
      ed.select('s_text1')
    })
    await a.waitForSelector('[data-testid="text-style"]')
    await a.click('[data-style="bold"]')
    await a.click('[data-style="underline"]')
    await a.click('[data-align="center"]')
    await a.click('[data-font-size="24"]')
    ok('太字・下線・中央揃え・サイズが相手に同期', await waitFor(() => b.evaluate(() => { const t = window.__qcEditor.getShape('s_text1'); return t && t.bold && t.underline && !t.italic && t.align === 'center' && t.fontSize === 24 })))

    // グループ化
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.createShape({ id: 's_rectC', type: 'rect', x: 400, y: 700, w: 80, h: 60 })
      ed.select(['s_rectA', 's_rectC'])
    })
    await a.click('[data-testid="group"]')
    ok('グループ化で同じ groupId が付く', await waitFor(() => a.evaluate(() => { const ed = window.__qcEditor; const g = ed.getShape('s_rectA').groupId; return !!g && ed.getShape('s_rectC').groupId === g })))
    await a.evaluate(() => window.__qcEditor.select('s_rectC'))
    ok('グループの一員を選ぶと全体が選ばれる', (await a.evaluate(() => window.__qcEditor.getSnapshot().selection.length)) === 2)
    await a.click('.board', { position: { x: 5, y: 5 } })
    await a.evaluate(() => window.__qcEditor.select('s_rectC'))
    await a.keyboard.press('Control+Shift+g')
    ok('Ctrl+Shift+G でグループ解除', await waitFor(() => a.evaluate(() => window.__qcEditor.getShape('s_rectA').groupId === null && window.__qcEditor.getShape('s_rectC').groupId === null)))

    // ロック
    await a.evaluate(() => window.__qcEditor.select('s_rectC'))
    await a.click('[data-testid="lock"]')
    ok('ロックが相手に同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getShape('s_rectC').locked === true)))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.updateShape('s_rectC', { x: 999 }); ed.deleteShapes(['s_rectC']) })
    await a.waitForTimeout(300)
    const lockedC = await a.evaluate(() => window.__qcEditor.getShape('s_rectC'))
    ok('ロック中は移動も削除もされない', lockedC && lockedC.x === 400)
    await a.evaluate(() => window.__qcEditor.select('s_rectC'))
    await a.keyboard.press('Control+l')
    ok('Ctrl+L でロック解除', await waitFor(() => a.evaluate(() => window.__qcEditor.getShape('s_rectC').locked === false)))
    await a.evaluate(() => window.__qcEditor.deleteShapes(['s_rectC']))

    // 複数ページ
    await a.click('[data-testid="page-add"]')
    const pageId = await waitFor(() => a.evaluate(() => { const s = window.__qcEditor.getSnapshot(); return s.pages.length === 2 && s.currentPage !== 'p1' ? s.currentPage : null }))
    await a.evaluate(() => window.__qcEditor.createShape({ id: 's_note_p2', type: 'note', x: 100, y: 100, text: '2 ページ目' }))
    ok('新しいページの図形は 1 ページ目に出ない', await a.evaluate(() => { const ed = window.__qcEditor; ed.setPage('p1'); const hidden = !ed.getShapes().some((s) => s.id === 's_note_p2'); const all = ed.getSnapshot().allShapes.some((s) => s.id === 's_note_p2'); return hidden && all }))
    ok('相手にもページが同期される', await waitFor(() => b.evaluate((id) => window.__qcEditor.getSnapshot().pages.some((p) => p.id === id), pageId)))
    await b.evaluate((id) => window.__qcEditor.setPage(id), pageId)
    ok('相手がページを切り替えると図形が見える', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.id === 's_note_p2'))))
    ok('ページバーに相手の人数が出る', await waitFor(async () => (await a.locator(`[data-page="${pageId}"] .page-tab__peers`).textContent()) === '1'))
    await a.evaluate((id) => window.__qcEditor.renamePage(id, '図面レビュー'), pageId)
    ok('ページ名の変更が同期', await waitFor(() => b.evaluate((id) => window.__qcEditor.getSnapshot().pages.find((p) => p.id === id)?.name === '図面レビュー', pageId)))
    ok('図形があるページは削除できない', (await a.evaluate((id) => window.__qcEditor.deletePage(id), pageId)) === false)
    await b.evaluate(() => { window.__qcEditor.deleteShapes(['s_note_p2']); window.__qcEditor.setPage('p1') })
    await waitFor(() => a.evaluate(() => !window.__qcEditor.getSnapshot().allShapes.some((s) => s.id === 's_note_p2')))
    ok('空になったページは削除できる', (await a.evaluate((id) => window.__qcEditor.deletePage(id), pageId)) === true && (await waitFor(() => b.evaluate(() => window.__qcEditor.getSnapshot().pages.length === 1 ? 1 : null))) === 1)

    // コメント
    const board = await a.locator('.board').boundingBox()
    const pt = (x, y) => [board.x + x, board.y + y]
    await a.evaluate(() => { const ed = window.__qcEditor; ed.setCamera({ x: 0, y: 0, scale: 1 }); ed.setTool('comment') })
    await settle(a)
    await a.mouse.click(...pt(460, 460))
    await a.waitForSelector('[data-testid="comment-pop"]')
    await a.fill('[data-testid="comment-input"]', 'この寸法を確認してください')
    await a.click('[data-testid="comment-submit"]')
    const cm = await waitFor(() => b.evaluate(() => window.__qcEditor.getSnapshot().comments[0] || null))
    ok('コメントが図形に付いて相手に届く', cm.shapeId === 's_rectA' && cm.text === 'この寸法を確認してください' && cm.author === '山田')
    await b.evaluate((id) => window.__qcEditor.replyComment(id, '確認しました'), cm.id)
    ok('返信が届く', await waitFor(() => a.evaluate((id) => window.__qcEditor.getSnapshot().comments.find((c) => c.id === id)?.replies.length === 1, cm.id)))
    // ピンをクリックしてスレッドを開く
    const pin = await a.evaluate(() => { const ed = window.__qcEditor; const s = ed.getShape('s_rectA'); return ed.pageToScreen({ x: s.x + s.w, y: s.y }) })
    await settle(a)
    await a.mouse.click(board.x + pin.x, board.y + pin.y)
    await a.waitForSelector('[data-testid="comment-list"]')
    ok('ピンをクリックするとスレッドが開く(2 件)', (await a.locator('[data-testid="comment-list"] li').count()) === 2)
    await a.click('[data-testid="comment-resolve"]')
    ok('解決したコメントは同期される', await waitFor(() => b.evaluate((id) => window.__qcEditor.getSnapshot().comments.find((c) => c.id === id)?.resolved === true, cm.id)))
    await a.keyboard.press('Escape')
  }

  // コピー/貼り付け・右クリックメニュー・整列・重なり順・微調整・直線/線種/矢頭/図形の種類/ラベル・PNG・検索・追従
  {
    const board = await a.locator('.board').boundingBox()
    const pt = (x, y) => [board.x + x, board.y + y]
    await a.evaluate(() => { const ed = window.__qcEditor; ed.selectNone(); ed.setCamera({ x: 0, y: 0, scale: 1 }) })
    const rectsBefore = await a.evaluate(() => window.__qcEditor.getShapes().filter((s) => s.type === 'rect').length)
    await settle(a)
    // 右クリック → コピー、空き地で右クリック → 貼り付け
    await a.mouse.click(...pt(460, 460), { button: 'right' })
    await a.waitForSelector('[data-testid="context-menu"]')
    await a.click('[data-testid="menu-copy"]')
    await a.mouse.click(...pt(900, 520), { button: 'right' })
    await a.waitForSelector('[data-testid="context-menu"]')
    await a.click('[data-testid="menu-paste"]')
    const pasted = await waitFor(() => a.evaluate((n) => { const rs = window.__qcEditor.getShapes().filter((s) => s.type === 'rect'); return rs.length === n + 1 ? rs[rs.length - 1] : null }, rectsBefore))
    ok(`右クリックのコピー→貼り付けで複製される(貼り付け位置の中心 x=${Math.round(pasted.x + pasted.w / 2)})`, Math.abs(pasted.x + pasted.w / 2 - 900) < 2 && Math.abs(pasted.y + pasted.h / 2 - 520) < 2 && pasted.id !== 's_rectA')
    ok('貼り付けた図形は相手にも届く', await waitFor(() => b.evaluate((id) => !!window.__qcEditor.getShape(id), pasted.id)))

    // 整列・等間隔
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.createShape({ id: 's_al1', type: 'rect', x: 100, y: 480, w: 60, h: 40 })
      ed.createShape({ id: 's_al2', type: 'rect', x: 300, y: 510, w: 60, h: 40 })
      ed.createShape({ id: 's_al3', type: 'rect', x: 380, y: 540, w: 60, h: 40 })
      ed.select(['s_al1', 's_al2', 's_al3'])
    })
    await a.waitForSelector('[data-testid="align-row"]')
    await a.click('[data-align-how="top"]')
    ok('上揃え', await waitFor(() => a.evaluate(() => ['s_al1', 's_al2', 's_al3'].every((id) => window.__qcEditor.getShape(id).y === 480))))
    await a.click('[data-distribute="x"]')
    ok('左右に等間隔', await waitFor(() => a.evaluate(() => { const [p, q, r] = ['s_al1', 's_al2', 's_al3'].map((id) => window.__qcEditor.getShape(id)); return Math.abs((q.x - (p.x + p.w)) - (r.x - (q.x + q.w))) < 0.5 })))

    // 重なり順と微調整
    await a.evaluate(() => window.__qcEditor.select('s_al1'))
    await a.click('.board', { position: { x: 5, y: 5 } })
    await a.evaluate(() => window.__qcEditor.select('s_al1'))
    await a.keyboard.press('Control+Shift+]')
    ok('Ctrl+Shift+] で最前面へ', await waitFor(() => a.evaluate(() => { const ss = window.__qcEditor.getShapes(); return ss[ss.length - 1].id === 's_al1' })))
    await a.keyboard.press('Control+Shift+[')
    ok('Ctrl+Shift+[ で最背面へ', await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes()[0].id === 's_al1')))
    const x0 = await a.evaluate(() => window.__qcEditor.getShape('s_al1').x)
    await a.keyboard.press('Shift+ArrowRight')
    await a.keyboard.press('ArrowDown')
    ok('矢印キーで微調整(Shift で 10px)', await waitFor(() => a.evaluate((x0) => { const s = window.__qcEditor.getShape('s_al1'); return s.x === x0 + 10 && s.y === 481 }, x0)))

    // 直線ツール・線種・矢頭・図形の種類
    await a.evaluate(() => window.__qcEditor.setTool('line'))
    await settle(a)
    await a.mouse.move(...pt(600, 300))
    await a.mouse.down()
    await a.mouse.move(...pt(800, 380), { steps: 5 })
    await a.mouse.up()
    const line = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'arrow' && !s.headEnd && !s.headStart) || null))
    ok('直線ツールで矢頭なしの線', !!line)
    await a.evaluate((id) => window.__qcEditor.select(id), line.id)
    await a.waitForSelector('[data-testid="dash-row"]')
    await a.click('[data-dash="dashed"]')
    await a.click('[data-heads="both"]')
    ok('破線・両端矢頭が相手に同期', await waitFor(() => b.evaluate((id) => { const s = window.__qcEditor.getShape(id); return s.dash === 'dashed' && s.headStart && s.headEnd }, line.id)))
    await a.evaluate(() => window.__qcEditor.select('s_al2'))
    await a.waitForSelector('[data-testid="kind-row"]')
    await a.click('[data-kind="diamond"]')
    ok('図形の種類をひし形に', await waitFor(() => b.evaluate(() => window.__qcEditor.getShape('s_al2').kind === 'diamond')))

    // ラベル(ダブルクリックで編集)
    const al2 = await a.evaluate(() => window.__qcEditor.getShape('s_al2'))
    await a.evaluate(() => window.__qcEditor.selectNone())
    await settle(a)
    await a.mouse.dblclick(...pt(al2.x + al2.w / 2, al2.y + al2.h / 2))
    await a.waitForSelector('[data-testid="text-editor"]')
    await a.keyboard.type('判定')
    await a.keyboard.press('Escape')
    ok('図形内ラベルが相手に同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getShape('s_al2').label === '判定')))

    // PNG 書き出し
    const [dl] = await Promise.all([a.waitForEvent('download'), a.evaluate(() => window.__qcExport('page'))])
    const { statSync, readFileSync: rfs } = await import('node:fs')
    const pngHead = rfs(await dl.path()).subarray(0, 8).toString('hex')
    // ヘッドレス Chromium は日本語ファイル名を "download" にするため、中身(PNG シグネチャ)で判定
    ok(`ページを PNG 保存 (${statSync(await dl.path()).size} bytes)`, pngHead === '89504e470d0a1a0a' && statSync(await dl.path()).size > 2000)

    // 検索
    await a.click('.board', { position: { x: 5, y: 5 } })
    await a.keyboard.press('Control+f')
    await a.waitForSelector('[data-testid="find-bar"]')
    await a.fill('[data-testid="find-input"]', 'E2E-001')
    ok('検索の件数', (await waitFor(async () => { const t = await a.locator('[data-testid="find-count"]').textContent(); return /1 \/ 1/.test(t) ? t : null })) !== null)
    await a.keyboard.press('Enter')
    ok('Enter で該当図形へ移動・選択', await waitFor(() => a.evaluate(() => { const ed = window.__qcEditor; const sel = ed.getSelectedShapes(); return sel.length === 1 && sel[0].partNo === 'E2E-001' })))
    await a.keyboard.press('Escape')

    // 追従
    await b.evaluate(() => window.__qcEditor.setCamera({ x: -300, y: -200, scale: 1.5 }))
    await a.click('[data-testid="peers-btn"]')
    await a.click('[data-testid="follow-佐藤"]')
    ok('相手の画面に追従(倍率が一致)', await waitFor(() => a.evaluate(() => { const c = window.__qcEditor.getSnapshot().camera; return Math.abs(c.scale - 1.5) < 0.01 && window.__qcEditor.getSnapshot().following !== null })))
    await a.waitForSelector('[data-testid="follow-banner"]')
    await b.evaluate(() => window.__qcEditor.setCamera({ x: 0, y: 0, scale: 0.8 }))
    ok('相手が動くと追従して変わる', await waitFor(() => a.evaluate(() => Math.abs(window.__qcEditor.getSnapshot().camera.scale - 0.8) < 0.01)))
    await settle(a)
    await a.mouse.move(...pt(700, 400))
    await a.mouse.wheel(0, 100)
    ok('自分で操作すると追従が解除される', await waitFor(() => a.evaluate(() => window.__qcEditor.getSnapshot().following === null)))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.setCamera({ x: 0, y: 0, scale: 1 }); ed.selectNone() })
    await b.evaluate(() => window.__qcEditor.setCamera({ x: 0, y: 0, scale: 1 }))
  }

  // 区画・ミニマップ・版の履歴・雛形
  {
    const board = await a.locator('.board').boundingBox()
    const pt = (x, y) => [board.x + x, board.y + y]
    await a.evaluate(() => { const ed = window.__qcEditor; ed.selectNone(); ed.setCamera({ x: 0, y: 0, scale: 1 }); ed.setTool('frame') })
    await settle(a)
    await a.mouse.move(...pt(160, 60))
    await a.mouse.down()
    await a.mouse.move(...pt(700, 560), { steps: 5 })
    await a.mouse.up()
    const frame = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'frame') || null))
    ok(`区画ツールで区画を作成 (${frame.w}x${frame.h})`, frame.w >= 500 && frame.h >= 450)
    ok('区画は最背面に置かれる', await a.evaluate(() => window.__qcEditor.getShapes()[0].type === 'frame'))
    // 区画の中の図形は一緒に動く: rectA(400,420) は区画内、pasted rect は区画外
    const beforeA = await a.evaluate(() => window.__qcEditor.getShape('s_rectA'))
    const outside = await a.evaluate((f) => window.__qcEditor.getShapes().filter((s) => s.type === 'rect' && !(s.x >= f.x && s.y >= f.y && s.x + s.w <= f.x + f.w && s.y + s.h <= f.y + f.h)).map((s) => [s.id, s.x, s.y]), frame)
    await a.evaluate(() => window.__qcEditor.setTool('select'))
    // 見出し帯をドラッグ(区画の左上 -30px の帯)
    await settle(a)
    await a.mouse.move(...pt(frame.x + 30, frame.y - 15))
    await a.mouse.down()
    await a.mouse.move(...pt(frame.x + 130, frame.y + 35), { steps: 6 })
    await a.mouse.up()
    const afterA = await waitFor(() => a.evaluate((x) => { const s = window.__qcEditor.getShape('s_rectA'); return s.x !== x ? s : null }, beforeA.x))
    ok(`区画を動かすと中の図形も動く (rectA ${beforeA.x}→${afterA.x})`, Math.abs(afterA.x - beforeA.x - 100) < 12 && Math.abs(afterA.y - beforeA.y - 50) < 12)
    ok('区画の外の図形は動かない', await a.evaluate((o) => o.every(([id, x, y]) => { const s = window.__qcEditor.getShape(id); return !s || (s.x === x && s.y === y) }), outside))
    ok('区画は相手にも届く', await waitFor(() => b.evaluate((id) => !!window.__qcEditor.getShape(id), frame.id)))
    await a.evaluate((id) => { const ed = window.__qcEditor; ed.updateShape(id, { title: '検査エリア' }) }, frame.id)

    // ミニマップ: クリックで表示位置が動く
    await a.waitForSelector('[data-testid="minimap"]')
    const cam0 = await a.evaluate(() => window.__qcEditor.getSnapshot().camera)
    const mm = await a.locator('[data-testid="minimap"]').boundingBox()
    await settle(a)
    await a.mouse.click(mm.x + 20, mm.y + 20)
    const cam1 = await a.evaluate(() => window.__qcEditor.getSnapshot().camera)
    ok('ミニマップのクリックで表示位置が変わる', cam1.x !== cam0.x || cam1.y !== cam0.y)
    await a.evaluate(() => window.__qcEditor.setCamera({ x: 0, y: 0, scale: 1 }))

    // 版の履歴: 保存 → 変更 → 復元で戻る(相手にも反映)
    await a.click('[data-testid="versions-btn"]')
    await a.waitForSelector('[data-testid="versions-pop"]')
    await a.fill('[data-testid="version-name"]', '区画作成後')
    await a.click('[data-testid="version-save"]')
    ok('版を保存', (await waitFor(async () => { const n = await a.locator('[data-testid="version-row"]').count(); return n >= 1 ? n : null })) >= 1)
    const countBefore = await a.evaluate(() => window.__qcEditor.getSnapshot().allShapes.length)
    await a.evaluate(() => { const ed = window.__qcEditor; ed.createShape({ id: 's_tmp1', type: 'note', x: 900, y: 100, text: '復元で消える' }); ed.deleteShapes(['s_al1']) })
    await waitFor(() => b.evaluate(() => !!window.__qcEditor.getShape('s_tmp1') && !window.__qcEditor.getShape('s_al1')))
    a.once('dialog', (d) => d.accept())
    await a.click('[data-testid="version-restore"] >> nth=0')
    ok('復元で保存時の状態に戻る(追加した図形が消え、消した図形が戻る)', await waitFor(() => a.evaluate((n) => { const ed = window.__qcEditor; return !ed.getShape('s_tmp1') && !!ed.getShape('s_al1') && ed.getSnapshot().allShapes.length === n }, countBefore)))
    ok('復元は相手にも反映', await waitFor(() => b.evaluate(() => !window.__qcEditor.getShape('s_tmp1') && !!window.__qcEditor.getShape('s_al1'))))
    ok('復元前の状態も自動で版に残る', (await waitFor(async () => { const t = await a.locator('[data-testid="versions-pop"]').textContent(); return /復元前の自動保存/.test(t) ? t : null })) !== null)
    await a.keyboard.press('Escape')
    await a.click('[data-testid="versions-btn"]')

    // 雛形: なぜなぜ分析を挿入
    const n0 = await a.evaluate(() => window.__qcEditor.getShapes().length)
    await a.click('[data-testid="tpl-btn"]')
    await a.click('[data-tpl="why5"]')
    const added = await waitFor(() => a.evaluate((n0) => { const n = window.__qcEditor.getShapes().length - n0; return n >= 16 ? n : null }, n0))
    ok(`雛形「なぜなぜ分析」を挿入 (${added} 図形)`, added === 16)
    ok('雛形の矢印は付箋に吸着済み', await a.evaluate(() => { const sel = window.__qcEditor.getSelectedShapes(); const arrows = sel.filter((s) => s.type === 'arrow'); return arrows.length === 7 && arrows.every((a) => a.startBind && a.endBind && Math.hypot(a.dx, a.dy) > 10) }))
    ok('雛形は相手にも届く', await waitFor(() => b.evaluate((n) => window.__qcEditor.getShapes().length >= n, n0 + 16)))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.deleteShapes(ed.getSnapshot().selection); ed.setCamera({ x: 0, y: 0, scale: 1 }) })
    await a.click('[data-testid="tpl-btn"]')
    await a.click('[data-tpl="4m"]')
    ok('雛形「4M」の区画は最背面に入る', await waitFor(() => a.evaluate(() => { const ss = window.__qcEditor.getShapes(); const frames = ss.filter((s) => s.type === 'frame' && /Man|Machine|Material|Method/.test(s.title)); return frames.length === 4 && frames.every((f) => ss.indexOf(f) < 6) })))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.deleteShapes(ed.getSnapshot().selection); ed.setCamera({ x: 0, y: 0, scale: 1 }); ed.selectNone() })
  }

  // 表・レーザーポインター・自作の雛形
  {
    const board = await a.locator('.board').boundingBox()
    const pt = (x, y) => [board.x + x, board.y + y]
    await a.evaluate(() => { const ed = window.__qcEditor; ed.selectNone(); ed.setCamera({ x: 0, y: 0, scale: 1 }) })
    // 表ツールでクリック → 3x3 の表ができ、選択された状態で select ツールに戻る
    await a.keyboard.press('b')
    await settle(a)
    await a.mouse.click(...pt(850, 300))
    const table = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'table') || null))
    ok(`表ツールで表を作成 (${table.cells.length}x${table.colWidths.length})`, table.cells.length === 3 && table.colWidths.length === 3 && table.w === table.colWidths.reduce((x, y) => x + y, 0))
    ok('表の作成後は選択ツールに戻り表が選ばれている', await a.evaluate((id) => { const s = window.__qcEditor.getSnapshot(); return s.tool === 'select' && s.selection.length === 1 && s.selection[0] === id }, table.id))
    // 左上セルをダブルクリック → 入力 → Tab で隣のセルへ
    await settle(a)
    await a.mouse.dblclick(...pt(table.x + 20, table.y + 15))
    await a.waitForFunction(() => { const t = document.querySelector('[data-testid="text-editor"]'); return !!t && document.activeElement === t && t.value === '項目' })
    ok('セルのダブルクリックで編集が始まる(既存の文字が全選択される)', await a.evaluate(() => { const c = window.__qcEditor.getSnapshot().editingCell; const t = document.querySelector('[data-testid="text-editor"]'); return !!c && c.r === 0 && c.c === 0 && t.selectionStart === 0 && t.selectionEnd === 2 }))
    await a.keyboard.type('寸法')
    await a.keyboard.press('Tab')
    await a.waitForFunction(() => { const t = document.querySelector('[data-testid="text-editor"]'); return !!t && document.activeElement === t && t.value === '基準' && t.selectionEnd === 2 })
    ok('Tab で隣のセルへ移る', await a.evaluate(() => { const c = window.__qcEditor.getSnapshot().editingCell; return !!c && c.r === 0 && c.c === 1 }))
    await a.keyboard.type('±0.1')
    await a.keyboard.press('Enter')
    ok('セルの文字が保存される(既存の文字は置き換わる)', await a.evaluate((id) => { const t = window.__qcEditor.getShape(id); return t.cells[0][0] === '寸法' && t.cells[0][1] === '±0.1' && t.cells[0][2] === '結果' }, table.id))
    ok('表は相手にも同じ内容で届く', await waitFor(() => b.evaluate((id) => { const t = window.__qcEditor.getShape(id); return !!t && t.cells[0][0] === '寸法' && t.cells[0][1] === '±0.1' }, table.id)))
    // 行・列の追加/削除(スタイルパネル)
    await a.evaluate((id) => window.__qcEditor.select(id), table.id)
    await a.waitForSelector('[data-testid="table-row"]')
    await a.click('[data-table="row+"]')
    await a.click('[data-table="col+"]')
    ok('行+ 列+ で 4x4 になり大きさも追従', await a.evaluate((id) => { const t = window.__qcEditor.getShape(id); return t.cells.length === 4 && t.colWidths.length === 4 && t.cells.every((r) => r.length === 4) && t.h === t.rowHeights.reduce((x, y) => x + y, 0) }, table.id))
    await a.click('[data-table="col-"]')
    ok('列− で 4x3 に戻り文字は残る', await a.evaluate((id) => { const t = window.__qcEditor.getShape(id); return t.colWidths.length === 3 && t.cells[0][0] === '寸法' }, table.id))
    ok('行・列の変更が相手にも届く', await waitFor(() => b.evaluate((id) => { const t = window.__qcEditor.getShape(id); return !!t && t.cells.length === 4 && t.colWidths.length === 3 }, table.id)))
    await a.evaluate(() => window.__qcEditor.selectNone())

    // レーザーポインター: A がなぞると B の awareness に軌跡が届き、図形は増えない
    const nBefore = await a.evaluate(() => window.__qcEditor.getSnapshot().allShapes.length)
    await a.keyboard.press('p')
    await settle(a)
    await a.mouse.move(...pt(500, 300))
    await a.mouse.down()
    await a.mouse.move(...pt(600, 350), { steps: 8 })
    await a.mouse.move(...pt(700, 300), { steps: 8 })
    const trail = await waitFor(() => b.evaluate(() => { const c = window.__qcEditor.getSnapshot().collaborators.find((c) => c.laser && c.laser.points.length >= 4); return c ? c.laser.points.length : null }))
    ok(`レーザーの軌跡が相手に届く (${trail} 点)`, trail >= 4)
    await a.mouse.up()
    ok('レーザーは図形を作らない', (await a.evaluate(() => window.__qcEditor.getSnapshot().allShapes.length)) === nBefore)
    ok('レーザーを離すと軌跡が消える', await waitFor(() => b.evaluate(() => window.__qcEditor.getSnapshot().collaborators.every((c) => !c.laser))))
    await a.keyboard.press('v')

    // 自作の雛形: 付箋 2 枚を選んで右クリック → 名前を付けて保存 → 雛形メニューから挿入 → 削除
    await a.evaluate(() => { const ed = window.__qcEditor; ed.createShape({ id: 's_tp1', type: 'note', x: 450, y: 80, text: '受入' }); ed.createShape({ id: 's_tp2', type: 'note', x: 640, y: 80, text: '判定' }); ed.select(['s_tp1', 's_tp2']) })
    a.once('dialog', (d) => d.accept('受入手順'))
    await settle(a)
    await a.mouse.move(...pt(470, 100))
    await a.mouse.down({ button: 'right' })
    await a.mouse.up({ button: 'right' })
    await a.waitForSelector('[data-testid="context-menu"]')
    await a.click('[data-testid="menu-save-template"]')
    const tplList = await waitFor(async () => { const r = await fetch(`${BASE}/api/templates`, { headers: { cookie: await cookieOf(a) } }); const j = await r.json(); return j.length ? j : null })
    ok(`雛形をサーバーに保存 (${tplList[0].name}, ${tplList[0].shapes.length} 図形, 作成者 ${tplList[0].by})`, tplList.length === 1 && tplList[0].name === '受入手順' && tplList[0].shapes.length === 2 && tplList[0].by === '山田')
    ok('雛形の図形は相対座標に直されている', tplList[0].shapes.some((s) => s.x === 0 && s.y === 0))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.deleteShapes(['s_tp1', 's_tp2']); ed.selectNone() })
    // B(別の人)の雛形メニューにも出て挿入できる
    const nb = await b.evaluate(() => window.__qcEditor.getShapes().length)
    await b.click('[data-testid="tpl-btn"]')
    await b.waitForSelector('[data-tpl-custom]')
    ok('自作の雛形が相手のメニューにも出る', (await b.locator('[data-tpl-custom]').count()) === 1)
    await b.click('[data-tpl-custom]')
    ok('自作の雛形を挿入すると 2 図形が増える', await waitFor(() => b.evaluate((n) => window.__qcEditor.getShapes().length === n + 2, nb)))
    ok('挿入した図形は選択され新しい id を持つ', await b.evaluate(() => { const sel = window.__qcEditor.getSelectedShapes(); return sel.length === 2 && sel.every((s) => s.type === 'note' && !['s_tp1', 's_tp2'].includes(s.id)) }))
    await b.evaluate(() => { const ed = window.__qcEditor; ed.deleteShapes(ed.getSnapshot().selection) })
    // 他人の雛形は削除できない(403) / 本人は削除できる
    const del = await fetch(`${BASE}/api/templates/${tplList[0].id}`, { method: 'DELETE', headers: { cookie: await cookieOf(b) } })
    ok('他人が作った雛形は削除できない', del.status === 403)
    a.once('dialog', (d) => d.accept())
    await a.click('[data-testid="tpl-btn"]')
    await a.waitForSelector('[data-tpl-delete]')
    await a.click('[data-tpl-delete]')
    ok('本人は雛形を削除できる', await waitFor(async () => ((await a.locator('[data-tpl-custom]').count()) === 0 ? true : null)))
    await a.keyboard.press('Escape')
    ok('Esc で雛形メニューが閉じる', await waitFor(async () => ((await a.locator('[data-testid="tpl-pop"]').count()) === 0 ? true : null)))
    await a.evaluate(() => { const ed = window.__qcEditor; ed.setCamera({ x: 0, y: 0, scale: 1 }); ed.selectNone() })
  }

  // B が一覧の「+ 依頼」で作成 → 依頼者と日付が入る
  await b.click('[data-testid="sheet-add"]')
  ok('+ 依頼 で依頼者・依頼日が自動記録', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.requester === '佐藤' && /^\d{4}-\d{2}-\d{2}$/.test(s.requestedAt)))))

  // 一覧(スプレッドシート): 2 行、セル編集が B に同期、検索で絞り込み
  ok('A の一覧に 2 行', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) >= 2 ? 2 : null))) === 2)
  const firstPart = a.locator('[data-testid="sheet-row"] input[data-col="partNo"]').first()
  await firstPart.fill('SHEET-EDIT')
  ok('一覧セル編集 → B 同期', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.partNo === 'SHEET-EDIT'))))
  await a.fill('[data-testid="sheet-search"]', 'SHEET-EDIT')
  ok('検索で 1 行に絞り込み', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
  await a.fill('[data-testid="sheet-search"]', '')
  await a.selectOption('[data-testid="sheet-filter"]', '検査中')
  ok('状態フィルタで 1 行', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
  await a.selectOption('[data-testid="sheet-filter"]', '')

  // 一覧: キーボード移動・一括変更・納期超過の強調・集計
  {
    await a.locator('[data-testid="sheet-row"] input[data-col="lot"]').first().focus()
    await a.keyboard.press('ArrowDown')
    const focusedRow = await a.evaluate(() => { const el = document.activeElement; return el?.dataset?.col === 'lot' ? Array.from(document.querySelectorAll('[data-testid="sheet-row"]')).indexOf(el.closest('tr')) : -1 })
    ok('↓ キーで同じ列の次の行へ移動', focusedRow === 1)
    await a.keyboard.press('ArrowUp')
    ok('↑ キーで戻る', (await a.evaluate(() => Array.from(document.querySelectorAll('[data-testid="sheet-row"]')).indexOf(document.activeElement.closest('tr')))) === 0)
    await a.keyboard.press('Escape')

    await a.check('[data-testid="check-all"]')
    await a.waitForSelector('[data-testid="bulk-bar"]')
    ok('全選択で一括変更バーが出る(2 件)', /2 件/.test(await a.locator('[data-testid="bulk-bar"] strong').textContent()))
    const bulkOpts = await a.locator('[data-testid="bulk-status"] option').allTextContents()
    ok(`一括の状態変更は全カードから移れる状態だけ (${bulkOpts.slice(1).join('/')})`, bulkOpts.slice(1).join('/') === '受付/差戻し')
    await a.fill('[data-testid="bulk-assignee"]', '鈴木')
    await a.click('[data-testid="bulk-assignee-apply"]')
    ok('一括で担当を割当 → B に同期', await waitFor(() => b.evaluate(() => { const cs = window.__qcEditor.getShapes().filter((s) => s.type === 'request-card'); return cs.length === 2 && cs.every((s) => s.assignee === '鈴木') })))
    await a.click('[data-testid="bulk-clear"]')
    ok('選択解除でバーが消える', (await a.locator('[data-testid="bulk-bar"]').count()) === 0)

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    await a.evaluate((d) => { const ed = window.__qcEditor; ed.updateShape(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'E2E-001').id, { dueDate: d }) }, yesterday)
    await a.waitForSelector('[data-testid="overdue-count"]')
    ok('納期超過が件数と行の強調に出る', (await a.locator('[data-testid="sheet-row"][data-due="overdue"]').count()) === 1 && /納期超過 1/.test(await a.locator('[data-testid="overdue-count"]').textContent()))
    await a.check('[data-testid="sheet-overdue"]')
    ok('「納期超過のみ」で 1 行', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
    await a.uncheck('[data-testid="sheet-overdue"]')
    await a.selectOption('[data-testid="sheet-dept"]', '製造1課')
    ok('部門で絞り込み', (await waitFor(async () => { const n = await a.locator('[data-testid="sheet-row"]').count(); return n >= 1 ? n : null })) >= 1)
    await a.selectOption('[data-testid="sheet-dept"]', '')

    await a.click('[data-testid="tab-summary"]')
    await a.waitForSelector('[data-testid="summary"]')
    const tiles = await a.locator('.tile').count()
    const deptRows = await a.locator('[data-testid="by-dept"] tbody tr').count()
    ok(`集計ビュー: タイル ${tiles} 枚、部門別 ${deptRows} 行`, tiles >= 5 && deptRows >= 1)
    ok('集計に納期超過 1 件', /1/.test(await a.locator('.tile[data-tone="bad"] .tile__value').textContent()))
    await a.click('[data-testid="tab-list"]')
    await a.evaluate(() => { const ed = window.__qcEditor; ed.updateShape(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'E2E-001').id, { dueDate: '' }) })

    // ドロワーの高さをドラッグで変更
    const h0 = await a.evaluate(() => document.querySelector('.app__drawer').getBoundingClientRect().height)
    const handle = await a.locator('[data-testid="drawer-handle"]').boundingBox()
    await settle(a)
    await a.mouse.move(handle.x + 300, handle.y + 4)
    await a.mouse.down()
    await a.mouse.move(handle.x + 300, handle.y - 120, { steps: 5 })
    await a.mouse.up()
    const h1 = await a.evaluate(() => document.querySelector('.app__drawer').getBoundingClientRect().height)
    ok(`ドロワーの高さをドラッグで変更 (${h0} → ${h1})`, h1 > h0 + 80)

    // 期間指定(依頼日)
    const todayStr = new Date().toISOString().slice(0, 10)
    await a.fill('[data-testid="sheet-from"]', todayStr)
    ok('依頼日の期間で絞り込み(今日以降 = + 依頼で作った 1 件)', (await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 1 ? 1 : null))) === 1)
    await a.fill('[data-testid="sheet-from"]', '')
    await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === 2 ? 1 : null))

    // 表示列の選択と列幅
    const thBefore = await a.locator('.grid thead th[data-th]').count()
    await a.click('[data-testid="sheet-cols"]')
    await a.click('[data-col-toggle="note"]')
    ok('列の非表示', (await a.locator('.grid thead th[data-th]').count()) === thBefore - 1 && (await a.locator('.grid thead th[data-th="note"]').count()) === 0)
    await a.click('[data-col-toggle="note"]')
    await a.click('[data-testid="sheet-cols"]')
    const wBefore = await a.evaluate(() => document.querySelector('.grid thead th[data-th="partNo"]').getBoundingClientRect().width)
    const rz = await a.locator('[data-resizer="partNo"]').boundingBox()
    await settle(a)
    await a.mouse.move(rz.x + 3, rz.y + 8)
    await a.mouse.down()
    await a.mouse.move(rz.x + 83, rz.y + 8, { steps: 4 })
    await a.mouse.up()
    const wAfter = await a.evaluate(() => document.querySelector('.grid thead th[data-th="partNo"]').getBoundingClientRect().width)
    ok(`列幅をドラッグで変更 (${Math.round(wBefore)} → ${Math.round(wAfter)})`, wAfter > wBefore + 50)
    ok('列幅は localStorage に保存される', await a.evaluate(() => JSON.parse(localStorage.getItem('qc.sheet.widths') || '{}').partNo > 150))
  }

  // CSV: ダウンロードイベントが発生し内容に見出しが含まれる
  const [download] = await Promise.all([a.waitForEvent('download'), a.click('[data-testid="sheet-csv"]')])
  const csvPath = await download.path()
  const { readFileSync } = await import('node:fs')
  const csv = readFileSync(csvPath, 'utf8')
  ok(`CSV に見出しと行がある (${download.suggestedFilename()})`, csv.includes('状態') && csv.includes('SHEET-EDIT'))

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
    document.querySelector('.board').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 900, clientY: 500 }))
  })
  const imgSrc = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'image')?.src || null))
  ok('画像サイズが元画像に合う', await a.evaluate(() => { const i = window.__qcEditor.getShapes().find((s) => s.type === 'image'); return i.w === 120 && i.h === 80 }))
  ok('画像がサーバーに保存され A に見える', imgSrc.startsWith('/api/uploads/'))
  ok('画像はログイン無しでは取得不可', (await fetch(`${BASE}${imgSrc}`)).status === 401)
  await a.waitForSelector('[data-testid="gallery"] .gallery__item')
  ok('A のギャラリーに 1 件', (await a.locator('[data-testid="gallery"] .gallery__item').count()) === 1)

  // 画像トリミング: 選択 → トリミング開始 → 範囲を指定 → 適用 → 解除
  {
    const img0 = await a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'image'))
    await a.evaluate((id) => { const ed = window.__qcEditor; ed.select(id); ed.setCamera({ x: 0, y: 0, scale: 1 }) }, img0.id)
    await a.waitForSelector('[data-crop="start"]')
    await a.click('[data-crop="start"]')
    await a.waitForFunction(() => !!window.__qcCrop)
    ok('トリミング中は適用/やめるが出る', (await a.locator('[data-crop="apply"]').count()) === 1)
    await a.evaluate((i) => window.__qcCrop.setBox({ x: i.x + i.w / 4, y: i.y + i.h / 4, w: i.w / 2, h: i.h / 2 }), img0)
    await a.click('[data-crop="apply"]')
    const cropped = await waitFor(() => a.evaluate((id) => { const s = window.__qcEditor.getShape(id); return s.crop ? s : null }, img0.id))
    ok(`切り抜き後の表示寸法が半分になる (${cropped.w}x${cropped.h})`, Math.abs(cropped.w - img0.w / 2) < 1 && Math.abs(cropped.h - img0.h / 2) < 1)
    ok(`切り抜き範囲が元画像のピクセルで記録される (${cropped.crop.x},${cropped.crop.y},${cropped.crop.w}x${cropped.crop.h})`, cropped.crop.x === 30 && cropped.crop.y === 20 && cropped.crop.w === 60 && cropped.crop.h === 40)
    ok('切り抜きは相手にも届く', await waitFor(() => b.evaluate((id) => { const s = window.__qcEditor.getShape(id); return !!s && !!s.crop && s.crop.w === 60 }, img0.id)))
    await a.waitForSelector('[data-crop="reset"]')
    await a.click('[data-crop="reset"]')
    const reset = await waitFor(() => a.evaluate((id) => { const s = window.__qcEditor.getShape(id); return s.crop ? null : s }, img0.id))
    ok(`解除で元の全体に戻る (${reset.w}x${reset.h} at ${reset.x},${reset.y})`, reset.w === img0.w && reset.h === img0.h && Math.abs(reset.x - img0.x) < 1 && Math.abs(reset.y - img0.y) < 1)
    await a.evaluate(() => window.__qcEditor.selectNone())
  }

  // 図面の紐付け: A がカードを選び「図面を紐付け」→ ギャラリーをクリック
  await a.evaluate(() => {
    const ed = window.__qcEditor
    ed.select(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'SHEET-EDIT').id)
  })
  await a.click('[data-testid="start-link"]')
  await a.click('[data-testid="gallery"] .gallery__item >> nth=0')
  await a.waitForSelector('[data-testid="linked-images"] li')
  ok('カードに図面が紐付く(B でも見える)', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.linkedShapeIds.length === 1))))

  // kintone(モック)へ送信 → レコード番号がカードに書き戻され B にも届く
  await a.click('[data-testid="sheet-kintone"]')
  const msg = await (await a.waitForSelector('[data-testid="sync-msg"]')).textContent()
  ok(`kintone 送信結果: ${msg}`, /新規 2 件/.test(msg))
  ok('kintone レコード番号が B のカードに書き戻る', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().filter((s) => s.type === 'request-card').every((s) => /^\d+$/.test(s.kintoneRecordId)))))
  await a.click('[data-testid="sheet-kintone"]')
  const msg2 = await waitFor(async () => {
    const t = await a.locator('[data-testid="sync-msg"]').textContent()
    return /更新 2 件/.test(t) ? t : null
  })
  ok(`2 回目は更新: ${msg2}`, true)

  // CSV 取り込み(受付番号が一致すれば更新、無ければ新規)
  {
    const { writeFileSync: wf } = await import('node:fs')
    const csvPath = join(dataDir, 'import.csv')
    wf(csvPath, '\ufeff受付番号,品番,ロット,数量,依頼部門,状態,優先度,希望納期,備考\r\n' +
      ',IMP-001,LI1,7,組立課,受付,至急,2026/9/30,"CSV から, 取込"\r\n' +
      `${no1},,,,,,,,備考をCSVで更新\r\n`)
    await a.setInputFiles('[data-testid="import-file"]', csvPath)
    await a.waitForSelector('[data-testid="import-preview"]')
    const prev = await a.locator('[data-testid="import-preview"]').textContent()
    ok(`取り込み前の確認 (${prev.replace(/\s+/g, ' ').trim().slice(0, 40)}…)`, /新規 1 件/.test(prev) && /更新 1 件/.test(prev))
    await a.click('[data-testid="import-apply"]')
    ok('CSV の新規行がカードになり採番される(日付も正規化)', await waitFor(() => b.evaluate(() => { const c = window.__qcEditor.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'IMP-001'); return c && /^QC-/.test(c.no) && c.priority === '至急' && c.dueDate === '2026-09-30' && c.note === 'CSV から, 取込' && c.dept === '組立課' })))
    ok('受付番号が一致する行は既存カードを更新', await waitFor(() => b.evaluate((no) => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.no === no && s.note === '備考をCSVで更新'), no1)))
  }

  // 相手の存在
  ok('A に相手が見える', (await waitFor(() => a.evaluate(() => window.__qcEditor.getCollaborators().length))) === 1)

  // 閲覧者: 読み取り専用で接続され、書き込みが通らない
  const v = await open('閲覧者', 'pw-view')
  ok('閲覧者は readonly', await waitFor(() => v.evaluate(() => window.__qcEditor.isReadonly())))
  // 閲覧者が無理に書き込んでもサーバーが捨てる(他の人に届かない)
  const before = await a.evaluate(() => window.__qcEditor.getShapes().length)
  await v.evaluate(() => { window.__qcEditor.getSnapshot().readonly = false; window.__qcEditor.createShape({ type: 'note', x: 0, y: 0, text: 'viewer' }) })
  await a.waitForTimeout(800)
  ok('閲覧者の書き込みはサーバーで拒否される', (await a.evaluate(() => window.__qcEditor.getShapes().length)) === before)
  ok('閲覧者のヘッダーに「閲覧のみ」', (await v.locator('.badge--warn').count()) === 1)
  ok('閲覧者には + 依頼 が無い', (await v.locator('[data-testid="sheet-add"]').count()) === 0)
  await v.context().close()

  // 依頼フォーム: B がボードを開かずに依頼を出す(画像添付・至急)
  {
    const png = await b.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 200
      c.height = 100
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#16a34a'
      ctx.fillRect(0, 0, 200, 100)
      return c.toDataURL('image/png').split(',')[1]
    })
    const { writeFileSync } = await import('node:fs')
    const pngPath = join(dataDir, 'zumen.png')
    writeFileSync(pngPath, Buffer.from(png, 'base64'))
    const rooms = await (await fetch(`${BASE}/api/rooms`, { headers: { cookie: await cookieOf(b) } })).json()
    await b.goto(`${BASE}/form/${rooms[0].id}`)
    await b.waitForSelector('[data-testid="request-form"]')
    await b.fill('[data-field="partNo"]', 'FORM-777')
    await b.fill('[data-field="lot"]', 'LF1')
    await b.fill('[data-field="qty"]', '8')
    await b.fill('[data-field="dept"]', '製造3課')
    await b.fill('[data-field="title"]', '外径寸法の確認')
    await b.fill('[data-field="dueDate"]', '2026-09-30')
    await b.selectOption('[data-field="priority"]', '至急')
    await b.fill('[data-field="note"]', 'φ20 の外径')
    await b.setInputFiles('[data-testid="form-files"]', pngPath)
    await b.waitForSelector('[data-testid="form-gallery"] .gallery__item')
    await b.click('[data-testid="form-submit"]')
    const no = await (await b.waitForSelector('[data-testid="form-no"]')).textContent()
    ok(`依頼フォーム送信 → 受付番号 (${no})`, /^QC-\d{4}-\d{4}$/.test(no))
    const card = await waitFor(() => a.evaluate((no) => {
      const c = window.__qcEditor.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'FORM-777')
      return c && c.no === no ? c : null
    }, no))
    ok('フォームのカードが A のボードに現れる(至急・図面 1 枚・依頼者=佐藤・受付番号一致)', card.priority === '至急' && card.linkedShapeIds.length === 1 && card.requester === '佐藤' && card.dueDate === '2026-09-30')
    const img = await a.evaluate((id) => window.__qcEditor.getShape(id), card.linkedShapeIds[0])
    ok('添付画像が元サイズ比で置かれる', img && img.type === 'image' && img.w === 200 && img.h === 100)
    await b.screenshot({ path: join(shotDir, 'e2e-form-done.png') })
    await b.click('[data-testid="form-again"]')
    await b.waitForSelector('[data-testid="request-form"]')
    await b.screenshot({ path: join(shotDir, 'e2e-form.png') })
    // B をボードに戻す
    await b.goto(`${BASE}/b/${rooms[0].id}`)
    await b.waitForFunction(() => !!window.__qcEditor && document.querySelector('.dot--online'))
  }

  // 変更履歴: サーバーのログに誰が何を変えたかが残る
  {
    const rooms = await (await fetch(`${BASE}/api/rooms`, { headers: { cookie: await cookieOf(a) } })).json()
    const hist = await (await fetch(`${BASE}/api/rooms/${rooms[0].id}/history`, { headers: { cookie: await cookieOf(a) } })).json()
    const users = new Set(hist.map((h) => h.user))
    ok(`履歴 ${hist.length} 件、操作者: ${[...users].join(',')}`, hist.length > 5 && users.has('山田') && users.has('佐藤') && users.has('system') && !users.has('server'))
    ok('履歴に受付番号の採番(system)が残る', hist.some((h) => h.user === 'system' && h.action === 'update' && h.fields.no))
    ok('履歴に一覧セル編集(山田: 品番)が残る', hist.some((h) => h.user === '山田' && h.action === 'update' && h.fields.partNo === 'SHEET-EDIT'))
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.select(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'SHEET-EDIT').id)
    })
    await a.waitForSelector('[data-testid="card-editor"]')
    await a.click('[data-testid="toggle-history"]')
    const n = await waitFor(async () => {
      const items = await a.locator('[data-testid="history"] li b').count()
      return items >= 3 ? items : null
    })
    ok(`サイドバーにカードの履歴 ${n} 件`, n >= 3)
  }

  // 取消とアーカイブ: カードは消えず「取消」になる。完了・取消はアーカイブでボードから外れる
  {
    const before = await a.evaluate(() => window.__qcEditor.getShapes().filter((s) => s.type === 'request-card').length)
    await a.click('[data-testid="cancel-card"]')
    ok('「取消」でカードは消えず状態が取消になる', await waitFor(() => b.evaluate((n) => { const cs = window.__qcEditor.getShapes().filter((s) => s.type === 'request-card'); return cs.length === n && cs.some((s) => s.partNo === 'SHEET-EDIT' && s.status === '取消') }, before)))
    // Delete キーでも取消(物理削除しない)
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.select(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'FORM-777').id)
    })
    await a.click('.board', { position: { x: 5, y: 5 } })
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.select(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'FORM-777').id)
    })
    await a.keyboard.press('Delete')
    ok('Delete キーでも物理削除されず取消になる', await waitFor(() => a.evaluate((n) => { const cs = window.__qcEditor.getShapes().filter((s) => s.type === 'request-card'); return cs.length === n && cs.find((s) => s.partNo === 'FORM-777')?.status === '取消' }, before)))
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.updateShape(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'FORM-777').id, { status: '完了' })
    })
    await a.waitForSelector('[data-testid="sheet-archive"]')
    const rowsBefore = await a.locator('[data-testid="sheet-row"]').count()
    await a.click('[data-testid="sheet-archive"]')
    ok('完了・取消をアーカイブ → 一覧から消える', await waitFor(async () => { const n = await a.locator('[data-testid="sheet-row"]').count(); return n === rowsBefore - 2 ? true : null }))
    ok('アーカイブ済みは B のキャンバスにも出ない(データは残る)', await waitFor(() => b.evaluate(() => { const cs = window.__qcEditor.getShapes().filter((s) => s.type === 'request-card'); return cs.filter((s) => s.archived).length === 2 && document.querySelectorAll('[data-testid="sheet-row"]').length === cs.length - 2 })))
    await a.check('[data-testid="sheet-archived"]')
    ok('「アーカイブも表示」で一覧に戻る', await waitFor(async () => ((await a.locator('[data-testid="sheet-row"]').count()) === rowsBefore ? true : null)))
    await a.uncheck('[data-testid="sheet-archived"]')
    ok('一覧に受付番号列がある', (await a.locator('[data-testid="sheet-row"] td[data-col="no"]').first().textContent()).startsWith('QC-'))
  }

  // 検査結果と状態遷移ルール
  {
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.select(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'E2E-001').id)
    })
    await a.waitForSelector('[data-testid="card-editor"]')
    const opts = await a.locator('[data-testid="card-editor"] [data-field="status"] option').allTextContents()
    ok(`検査中から移れる状態だけが選べる (${opts.join('/')})`, opts.includes('検査中') && opts.includes('完了') && opts.includes('保留') && !opts.includes('未受付') && !opts.includes('取消'))
    await a.click('[data-testid="result-row"] [data-result="合格"]')
    ok('検査結果「合格」で判定者・判定日が自動記録され B に届く', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.partNo === 'E2E-001' && s.result === '合格' && s.judgedBy === '山田' && /^\d{4}-\d{2}-\d{2}$/.test(s.judgedAt)))))
    await a.fill('[data-testid="card-editor"] [data-field="resultNote"]', 'φ20.02')
    ok('所見が同期される', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.resultNote === 'φ20.02'))))
  }

  // 通知: Webhook に新規依頼・状態変更・検査結果が届く
  {
    const kinds = await waitFor(() => {
      const ev = new Set(received.map((r) => r.event))
      return ev.has('created') && ev.has('status') && ev.has('result') ? [...ev] : null
    })
    ok(`Webhook 通知 ${received.length} 件 (${kinds.join(',')})`, true)
    const created = received.find((r) => r.event === 'created' && /FORM-777/.test(r.title))
    ok('フォーム依頼の通知に受付番号・至急・依頼者が入る', created && /^QC-/.test(created.no) && /至急/.test(created.detail) && /佐藤/.test(created.detail))
    const admin = await loginCookie('管理者', 'pw-admin')
    const recent = await (await fetch(`${BASE}/api/notify/recent`, { headers: { cookie: admin } })).json()
    ok('管理者は最近の通知を API で確認できる', Array.isArray(recent) && recent.length === received.length)
    ok('メンバーは管理者 API を呼べない', (await fetch(`${BASE}/api/notify/recent`, { headers: { cookie: await cookieOf(a) } })).status === 403)
  }

  // バックアップと自動アーカイブ(管理者 API)
  {
    const admin = await loginCookie('管理者', 'pw-admin')
    const r = await (await fetch(`${BASE}/api/admin/backup`, { method: 'POST', headers: { cookie: admin } })).json()
    const { existsSync: ex, readdirSync: rd } = await import('node:fs')
    ok(`バックアップ作成 ${r.dest}`, r.dest && ex(join(r.dest, 'rooms')) && rd(join(r.dest, 'rooms')).some((f) => f.endsWith('.yjs')) && !ex(join(r.dest, 'secret')))
    await a.evaluate(() => {
      const ed = window.__qcEditor
      ed.updateShape(ed.getShapes().find((s) => s.type === 'request-card' && s.partNo === 'E2E-001').id, { status: '完了' })
    })
    await a.waitForTimeout(300)
    const ar = await (await fetch(`${BASE}/api/admin/archive`, { method: 'POST', headers: { cookie: admin, 'content-type': 'application/json' }, body: JSON.stringify({ days: 0 }) })).json()
    ok(`自動アーカイブ(0 日)で完了カードが外れる (${ar.archived} 件)`, ar.archived === 1)
    ok('自動アーカイブは全員に同期される', await waitFor(() => b.evaluate(() => window.__qcEditor.getShapes().some((s) => s.type === 'request-card' && s.partNo === 'E2E-001' && s.archived))))
  }

  // PDF 図面: ページを画像にしてボードへ
  {
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >> endobj
4 0 obj << /Length 30 >> stream
0 0 1 rg 10 10 180 80 re f
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF`
    await b.evaluate(async (pdfText) => {
      const dt = new DataTransfer()
      dt.items.add(new File([pdfText], 'zumen-A.pdf', { type: 'application/pdf' }))
      document.querySelector('.board').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 700, clientY: 400 }))
    }, pdf)
    const img = await waitFor(() => a.evaluate(() => window.__qcEditor.getShapes().find((s) => s.type === 'image' && s.name === 'zumen-A.png') || null), 30000)
    ok(`PDF がページ画像として取り込まれる (${img.w}x${img.h})`, img.w === 600 && img.h === 300)
  }

  // タブレット幅: サイドバーが折りたたまれ、2 本指でピンチズームできる
  {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 700 }, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`)
    await page.fill('input[placeholder="例: 山田"]', '山田')
    await page.fill('input[type="password"]', 'pw-yamada')
    await page.click('button[type="submit"]')
    await page.waitForSelector('.rooms button')
    await page.click('.rooms button >> nth=0')
    await page.waitForFunction(() => !!window.__qcEditor && document.querySelector('.dot--online'))
    ok('狭い画面ではサイドバーが閉じている', (await page.locator('.app[data-sidebar="false"]').count()) === 1)
    await page.click('[data-testid="toggle-sidebar"]')
    ok('☰ でサイドバーが開く', (await page.locator('.app[data-sidebar="true"]').count()) === 1)
    const before = await page.evaluate(() => window.__qcEditor.getSnapshot().camera.scale)
    await page.evaluate(() => {
      const el = document.querySelector('.board')
      const r = el.getBoundingClientRect()
      const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1 }))
      fire('pointerdown', 1, 300, 300)
      fire('pointerdown', 2, 400, 300)
      fire('pointermove', 1, 250, 300)
      fire('pointermove', 2, 450, 300)
      fire('pointerup', 1, 250, 300)
      fire('pointerup', 2, 450, 300)
    })
    const after = await page.evaluate(() => window.__qcEditor.getSnapshot().camera.scale)
    ok(`ピンチで拡大 (${before.toFixed(2)} → ${after.toFixed(2)})`, after > before * 1.5)
    await page.screenshot({ path: join(shotDir, 'e2e-tablet.png') })
    await ctx.close()
  }

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
      ed.select(ed.getShapes().find((s) => s.type === 'request-card').id)
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
      window.__qcEditor.zoomToFit()
    })
  }
  await a.waitForTimeout(500)
  await a.screenshot({ path: join(shotDir, 'e2e-a.png') })
  await b.screenshot({ path: join(shotDir, 'e2e-b.png') })
  await browser.close()

  // 永続化
  const files = await waitFor(() => {
    const f = readdirSync(join(dataDir, 'rooms'))
    return f.some((x) => x.endsWith('.yjs')) ? f : null
  })
  ok(`永続化: ${files.filter((f) => f.endsWith('.yjs'))}`, true)

  // 再起動後も内容が残る(永続化ファイルからの復元)
  {
    const ctx = await (await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })).newContext()
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`)
    await page.fill('input[placeholder="例: 山田"]', '山田')
    await page.fill('input[type="password"]', 'pw-yamada')
    await page.click('button[type="submit"]')
    await page.waitForSelector('.rooms button')
    await page.click('.rooms button >> nth=0')
    await page.waitForFunction(() => !!window.__qcEditor && document.querySelector('.dot--online'))
    const n = await waitFor(() => page.evaluate(() => { const n = window.__qcEditor.getShapes().length; return n > 0 ? n : null }))
    ok(`再接続で図形が復元される (${n} 件)`, n >= 4)
    await ctx.browser().close()
  }
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
  hookServer.close()
}
process.exit(exitCode)
