// 単一ファイル版(standalone/qc-board.html)の動作確認。CHROMIUM_PATH と SHOT_DIR を指定して実行
import { chromium } from 'playwright-core'
import { join } from 'node:path'
const file = 'file://' + process.cwd() + '/standalone/qc-board.html'
const shots = process.env.SHOT_DIR
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const errors = []
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) }); await p.goto(file); return p }
const ok = (l, c) => { console.log(c ? 'ok ' : 'NG ', l); if (!c) process.exitCode = 1 }
const a = await open()
await a.fill('input[placeholder="例: 山田"]', '山田')
await a.fill('input[placeholder^="新しいボード名"]', '品質管理室')
await a.click('button:has-text("作成")')
await a.click('.rooms button >> nth=0')
await a.waitForSelector('#board canvas')
ok('ボードが開く', await a.evaluate(() => !!window.qc && window.qc.S.boardName === '品質管理室'))
const board = await a.locator('#board').boundingBox(); const pt = (x, y) => [board.x + x, board.y + y]
// 付箋(デモ)がある → 依頼カードツールでクリック
await a.keyboard.press('c'); await a.mouse.move(...pt(500, 100)); await a.mouse.down(); await a.mouse.move(...pt(520, 120)); await a.mouse.up()
ok('依頼カードが作られ受付番号が付く', await a.evaluate(() => { const c = window.qc.cards(); return c.length === 1 && /^QC-\d{4}-0001$/.test(c[0].no) }))
ok('サイドバーにカード編集が出る', (await a.locator('[data-testid="card-editor"]').count()) === 1)
await a.fill('[data-field="partNo"]', 'A-100'); await a.press('[data-field="partNo"]', 'Tab')
ok('サイドバーの編集がカードに入る', await a.evaluate(() => window.qc.cards()[0].partNo === 'A-100'))
// 表
await a.evaluate(() => document.activeElement.blur()); await a.keyboard.press('Escape'); await a.keyboard.press('b'); await a.locator('#board canvas.main').click({ position: { x: 500, y: 400 }, timeout: 5000 })
const t = await a.evaluate(() => window.qc.S.doc.shapes.find((s) => s.type === 'table'))
ok('表が作られる', !!t && t.cells.length === 3)
await a.mouse.dblclick(...pt(t.x + 20, t.y + 15)); await a.waitForSelector('[data-testid="text-editor"]')
await a.keyboard.type('寸法'); await a.keyboard.press('Tab'); await a.keyboard.type('±0.1'); await a.keyboard.press('Enter')
ok('セル編集と Tab 移動', await a.evaluate((id) => { const t = window.qc.get(id); return t.cells[0][0] === '寸法' && t.cells[0][1] === '±0.1' }, t.id))
await a.click('[data-table="row+"]')
ok('行追加', await a.evaluate((id) => window.qc.get(id).cells.length === 4, t.id))
// 矢印: 付箋 → 表 に吸着
const note = await a.evaluate(() => window.qc.S.doc.shapes.find((s) => s.type === 'note'))
await a.keyboard.press('Escape'); await a.keyboard.press('a'); await a.mouse.move(...pt(note.x + 100, note.y + 100)); await a.mouse.down(); await a.mouse.move(...pt(t.x + 50, t.y + 50), { steps: 5 }); await a.mouse.up()
ok('矢印が両端で吸着', await a.evaluate(() => { const ar = window.qc.S.doc.shapes.find((s) => s.type === 'arrow'); return !!ar && !!ar.startBind && !!ar.endBind }))
// 取り消し
await a.keyboard.press('Control+z')
ok('Ctrl+Z で矢印が消える', await a.evaluate(() => !window.qc.S.doc.shapes.some((s) => s.type === 'arrow')))
await a.keyboard.press('Control+y')
ok('Ctrl+Y で戻る', await a.evaluate(() => window.qc.S.doc.shapes.some((s) => s.type === 'arrow')))
// 雛形
await a.click('[data-testid="tpl-btn"]'); await a.click('[data-tpl="why5"]')
ok('雛形なぜなぜ分析(16 図形)', await a.evaluate(() => window.qc.S.sel.size === 15 || window.qc.S.sel.size === 16))
await a.keyboard.press('Delete')
// 一覧: 2 件目をフォームから作って範囲貼り付け
await a.evaluate(() => window.qc.createShape({ type: 'request-card', x: 900, y: 100, partNo: 'B-200', dept: '製造2課' }, { select: false }))
ok('2 行の一覧', (await a.locator('.grid tbody tr').count()) === 2)
await a.locator('.grid tbody tr input[data-col="assignee"]').first().focus()
await a.keyboard.press('Shift+ArrowDown')
ok('Shift+↓ で範囲', (await a.locator('td[data-range="true"]').count()) === 2)
const pasted = await a.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '田中'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(ev); return ev.defaultPrevented })
ok('1 値を範囲に貼ると両方に入る', pasted && (await a.evaluate(() => window.qc.cards().every((c) => c.assignee === '田中'))))
// 集計
await a.click('.tab:has-text("集計")'); ok('集計ビュー', (await a.locator('.tile').count()) >= 4); await a.click('.tab:has-text("依頼一覧")')
// 版
await a.click('.header button:has-text("版")'); await a.fill('.versions input', 'テスト版'); await a.click('.versions button:has-text("保存")')
ok('版を保存', (await a.locator('.versions li').count()) === 1)
// 2 つ目のタブ: 同期
const b = await open(); await b.waitForSelector('.rooms button'); await b.click('.rooms button >> nth=0'); await b.waitForSelector('#board canvas')
await b.waitForTimeout(300)
ok('別タブに同じ図形が見える', await b.evaluate(() => window.qc.cards().length === 2))
await a.evaluate(() => window.qc.createShape({ type: 'note', x: 700, y: 500, text: '同期テスト' }))
await b.waitForTimeout(300)
ok('A の追加が B に届く', await b.evaluate(() => window.qc.S.doc.shapes.some((s) => s.text === '同期テスト')))
await a.waitForTimeout(2200)
ok('在席(相手 1 人)', await b.evaluate(() => window.qc.S.peers.size === 1))
await a.keyboard.press('Escape'); await a.evaluate(() => window.qc.selectNone()); await a.evaluate(() => window.qc.zoomToFit())
await a.waitForTimeout(300)
if (shots) { await a.screenshot({ path: join(shots, 'standalone-a.png') }); await b.screenshot({ path: join(shots, 'standalone-b.png') }) }
ok('JS エラーなし', errors.length === 0); if (errors.length) console.log(errors)
await browser.close()
