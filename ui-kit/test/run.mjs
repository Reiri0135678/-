// ui-kit のテスト実行: node ui-kit/test/run.mjs
// ES モジュールは file:// では読めないため、簡易 HTTP サーバを立てて Chromium(headless) で test.html を開く。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/test/test.html`;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1000, height: 1600 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(url); await page.waitForFunction(() => window.__done, null, { timeout: 15000 });

// ブラウザ操作テスト: createDrag（クリック / ドラッグ）と attachPanZoom（パン / ホイール）
const results = await page.evaluate(() => window.__results);
const pad = await page.$('#pad'); await pad.scrollIntoViewIfNeeded(); const bb = await pad.boundingBox();
await page.mouse.click(bb.x + 10, bb.y + 10);
await page.mouse.move(bb.x + 20, bb.y + 20); await page.mouse.down(); await page.mouse.move(bb.x + 22, bb.y + 21); await page.mouse.move(bb.x + 60, bb.y + 50, { steps: 3 }); await page.mouse.up();
const dragLog = await page.evaluate(() => window.__dragLog);
results.push({ name: 'drag: click（閾値未満）→ onClick', ok: dragLog[0] === 'click', err: JSON.stringify(dragLog) });
results.push({ name: 'drag: 閾値超で start → move → end(dx=40,dy=30)', ok: dragLog[1] === 'start' && dragLog.at(-1) === 'end:40,30', err: JSON.stringify(dragLog) });
const camEl = await page.$('#cam'); await camEl.scrollIntoViewIfNeeded(); const cb = await camEl.boundingBox();
await page.mouse.move(cb.x + 50, cb.y + 50); await page.mouse.down(); await page.mouse.move(cb.x + 80, cb.y + 60, { steps: 3 }); await page.mouse.up();
let cam = await page.evaluate(() => ({ x: window.__cam.x, y: window.__cam.y, s: window.__cam.scale }));
results.push({ name: 'attachPanZoom: ドラッグでパン (30,10)', ok: cam.x === 30 && cam.y === 10, err: JSON.stringify(cam) });
const px = Math.round(cb.x + 100), py = Math.round(cb.y + 60);   // CDP は整数座標で送るので丸めて期待値を作る
const before = await page.evaluate(([px, py]) => { const r = document.getElementById('cam').getBoundingClientRect(); return window.__cam.toWorld(px - r.left, py - r.top); }, [px, py]);
await page.mouse.move(px, py); await page.mouse.wheel(0, -400); await page.waitForTimeout(50);
const after = await page.evaluate(([px, py]) => { const r = document.getElementById('cam').getBoundingClientRect(); return { w: window.__cam.toWorld(px - r.left, py - r.top), s: window.__cam.scale }; }, [px, py]);
results.push({ name: 'attachPanZoom: ホイールでカーソル基準ズーム（不動点維持）', ok: after.s > 1 && Math.abs(after.w.x - before.x) < 1e-6 && Math.abs(after.w.y - before.y) < 1e-6, err: JSON.stringify({ before, after }) });

// sortable: a を c の下へドラッグ
const li = await page.$('#sortable li:first-child'); await li.scrollIntoViewIfNeeded(); const lb = await li.boundingBox();
await page.mouse.move(lb.x + 10, lb.y + lb.height / 2); await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(lb.x + 10, lb.y + lb.height / 2 + lb.height * 2.2 * i / 8); await page.waitForTimeout(16); }
await page.mouse.up(); await page.waitForTimeout(50);
const order = await page.evaluate(() => window.__sortableOrder);
results.push({ name: 'sortable: a を末尾へドラッグ → [b, c, a]', ok: JSON.stringify(order) === '["b","c","a"]', err: JSON.stringify(order) });
// split: ガターを 40px 右へ
const g = await page.$('#split .uk-gutter'); await g.scrollIntoViewIfNeeded(); const gb = await g.boundingBox();
await page.mouse.move(gb.x + 3, gb.y + 10); await page.mouse.down(); await page.mouse.move(gb.x + 43, gb.y + 10, { steps: 4 }); await page.mouse.up();
const sizes = await page.evaluate(() => window.__split.getSizes());
results.push({ name: 'split: ガターのドラッグで幅 +40', ok: sizes[0] === 240, err: JSON.stringify(sizes) });
await page.mouse.dblclick(gb.x + 43, gb.y + 10);
const reset = await page.evaluate(() => window.__split.getSizes());
results.push({ name: 'split: ダブルクリックで初期値 150', ok: reset[0] === 150, err: JSON.stringify(reset) });

await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.ok ? '' : ' — ' + r.err}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, pageerrors=${errors.length}`);
errors.forEach(e => console.log('  pageerror:', e));
process.exit(failed.length || errors.length ? 1 : 0);
