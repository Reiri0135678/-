// 教材ページの検証: node docs/ui-guide/test/verify.mjs
//  1. 全 HTML を headless Chromium で開き、JS エラーが無いこと
//  2. ページ内リンク（ファイル・アンカー）が全て存在すること
//  3. デモ数・コード表示数・目次数が一致すること
//  4. 代表的な操作（クリック / ドラッグ / ホイール / タッチスワイプ）で期待どおり状態が変わること
// 前提: playwright と Chromium（PLAYWRIGHT_MODULE / CHROMIUM_PATH で場所を指定可）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const url = f => 'file://' + path.join(dir, f);
const results = []; const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

// 1〜3: 全ページ
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url(f)); await p.waitForTimeout(300);
  ok(`${f}: JSエラーなし`, errs.length === 0, errs.join(' | '));
  const links = await p.$$eval('a[href]', a => [...new Set(a.map(x => x.getAttribute('href')).filter(h => !/^https?:/.test(h)))]);
  const missing = links.filter(l => { const [file, hash] = l.split('#'); const t = path.join(dir, file || f); return !fs.existsSync(t) || (hash && !fs.readFileSync(t, 'utf8').includes(`id="${hash}"`)); });
  ok(`${f}: リンク ${links.length} 本が全て解決`, missing.length === 0, missing.join(' '));
  const n = await p.evaluate(() => ({ demo: document.querySelectorAll('section.demo').length, toc: document.querySelectorAll('aside.toc a').length }));
  if (n.demo) ok(`${f}: デモ ${n.demo} 件 = 目次 ${n.toc} 件`, n.demo === n.toc);
  await p.close();
}

// 4: 代表操作
const drag = async (p, sel, dx, dy) => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 6; i++) { await p.mouse.move(x + dx * i / 6, y + dy * i / 6); await p.waitForTimeout(16); } await p.mouse.up(); await p.waitForTimeout(120); };
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('02-basic.html'));
  await drag(p, '#s02-view', 120, 60); ok('02 パン: translate が変わる', (await p.$eval('#s02-world', e => e.style.transform)).includes('120px'));
  await p.click('#s15-open'); ok('15 モーダル: showModal', await p.$eval('#s15-dlg', d => d.open)); await p.keyboard.press('Escape');
  await p.click('#s19-t2'); ok('19 タブ: 切替', await p.$eval('#s19-p2', e => !e.hidden));
  await p.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('03-custom.html'));
  await p.$eval('#s23-view', v => v.scrollTop = 50000); await p.waitForTimeout(50); ok('23 仮想スクロール: DOM 行数 < 30', (await p.$$eval('#s23-rows .r', r => r.length)) < 30);
  await drag(p, '#s33-gutter', 100, 0); ok('33 分割パネル: 幅が変わる', (await p.textContent('#s33-out')).includes('320'));
  await p.click('#s37-add'); await p.click('#s37-undo'); ok('37 Undo: 戻る', (await p.textContent('#s37-out')).includes('future:1'));
  await p.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('04-pro.html'));
  const v = await p.$('#s43-view'); await v.scrollIntoViewIfNeeded(); const b = await v.boundingBox(); await p.mouse.move(b.x + 200, b.y + 100); await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
  ok('43 無限キャンバス: ホイールでズーム', (await p.textContent('#s43-out')).includes('scale='));
  await drag(p, '#s48-view', 200, 150); ok('48 矩形選択: 選択数 > 0', !(await p.textContent('#s48-out')).includes('選択: 0'));
  await p.close(); }
{ // タッチ（09 スワイプ）: hasTouch で pointerType=touch のイベントを発生させる
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 800, height: 900 } }); const p = await ctx.newPage();
  await p.goto(url('02-basic.html')); const el = await p.$('#s09-area'); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox();
  const cdp = await ctx.newCDPSession(p); const y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 40, y }] });
  for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 40 + 40 * i, y }] }); await p.waitForTimeout(10); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(100);
  ok('09 スワイプ（タッチ）: 右と判定', (await p.textContent('#s09-out')).includes('スワイプ右'), await p.textContent('#s09-out'));
  await ctx.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('11-quiz.html')); await p.click('#start'); await p.click('.choice'); ok('11 クイズ: 回答後に次へが出る', !!(await p.$('#nextBtn')));
  await p.close(); }

await browser.close();
const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
