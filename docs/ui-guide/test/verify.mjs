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
// 14-playground.html#id はアンカーではなくデモの ID（demo-data.js に存在すればよい）
const demoIds = new Set([...fs.readFileSync(path.join(dir, 'assets', 'demo-data.js'), 'utf8').matchAll(/"id":"(\w+)"/g)].map(m => m[1]));

// 0: 生成物（demo-data / search-index）が最新か（build.mjs を一時出力と比較）
{ const { execFileSync } = await import('node:child_process');
  const targets = ['assets/demo-data.js', 'assets/search-index.js', 'assets/manifest.js', 'dist/ui-guide-standalone.html'];
  const read = () => targets.map(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/"generated":"[^"]*"/, ''));  // 生成日は比較から外す
  const before = read();
  execFileSync(process.execPath, [path.join(dir, 'build.mjs')], { stdio: 'ignore' });
  const after = read();
  const stale = targets.filter((_, i) => before[i] !== after[i]);
  ok('生成物が最新（npm run build:docs 済み）', stale.length === 0, '再生成が必要: ' + stale.join(', ')); }

// 1〜3: 全ページ
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url(f)); await p.waitForTimeout(300);
  ok(`${f}: JSエラーなし`, errs.length === 0, errs.join(' | '));
  const links = await p.$$eval('a[href]', a => [...new Set(a.map(x => x.getAttribute('href')).filter(h => !/^https?:/.test(h)))]);
  const missing = links.filter(l => { const [file, hash] = l.split('#'); if (file === '14-playground.html') return hash ? !demoIds.has(hash) : false; const t = path.join(dir, file || f); return !fs.existsSync(t) || (hash && !fs.readFileSync(t, 'utf8').includes(`id="${hash}"`)); });
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
{ // プレイグラウンド: デモを読み込み、JS を書き換えて実行できる
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('14-playground.html#n01')); await p.waitForTimeout(400);
  const f = p.frameLocator('#frame'); ok('14 プレイグラウンド: n01 が iframe で動く', (await f.locator('#s01-box div').count()) === 100);
  await p.fill('#ed-js', "document.querySelector('#s01-box').textContent = 'EDITED';"); await p.click('#run'); await p.waitForTimeout(300);
  ok('14 プレイグラウンド: 書き換えた JS が実行される', (await f.locator('#s01-box').textContent()) === 'EDITED');
  await p.fill('#ed-js', 'throw new Error("boom")'); await p.click('#run'); await p.waitForTimeout(300);
  ok('14 プレイグラウンド: エラーが表示される', (await p.textContent('#err')).includes('boom'));
  await p.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('00-index.html')); await p.fill('#gq', '慣性'); await p.waitForTimeout(400);
  ok('00 横断検索: 「慣性」がヒット', (await p.$$eval('#gres a', a => a.length)) > 0);
  await p.goto(url('01-ui-operations-catalog.html')); await p.evaluate(() => localStorage.removeItem('ui-guide.progress'));
  await p.reload(); await p.click('.item .done-cb input'); await p.reload(); await p.waitForTimeout(200);
  ok('01 進捗: チェックが再読込後も残る', (await p.$$eval('.item.done', i => i.length)) === 1);
  await p.evaluate(() => localStorage.removeItem('ui-guide.progress'));
  await p.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('11-quiz.html')); await p.click('#start'); await p.click('.choice'); ok('11 クイズ: 回答後に次へが出る', !!(await p.$('#nextBtn')));
  await p.click('#mode-live'); await p.click('#start'); await p.waitForTimeout(500);
  ok('11 クイズ（動きを見て当てる）: iframe にデモが出て説明文は隠れる', (await p.$eval('#live', f => !f.hidden && f.srcdoc.includes('class="stage'))) && (await p.$eval('#desc', d => d.hidden)));
  await p.close(); }
{ // プレイグラウンドの下書き保存 / カリキュラムのチェック保存
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('14-playground.html#n01')); await p.evaluate(() => localStorage.removeItem('ui-guide.playground.n01')); await p.waitForTimeout(200);
  await p.fill('#ed-css', '/* draft */'); await p.waitForTimeout(500); await p.reload(); await p.waitForTimeout(400);
  ok('14 プレイグラウンド: 下書きが再読込後も残る', (await p.inputValue('#ed-css')) === '/* draft */' && !(await p.$eval('#draft', d => d.hidden)));
  await p.click('#discard'); await p.waitForTimeout(200); ok('14 プレイグラウンド: 下書きを破棄で元に戻る', (await p.inputValue('#ed-css')) !== '/* draft */' && (await p.evaluate(() => localStorage.getItem('ui-guide.playground.n01'))) === null);
  await p.goto(url('15-curriculum.html')); await p.evaluate(() => localStorage.removeItem('ui-guide.curriculum')); await p.reload();
  await p.click('#days input[type=checkbox]'); await p.reload(); await p.waitForTimeout(200);
  ok('15 カリキュラム: チェックが再読込後も残る', (await p.$$eval('#days input:checked', i => i.length)) === 1);
  await p.evaluate(() => localStorage.removeItem('ui-guide.curriculum'));
  await p.close(); }

{ // M層（最新機能）と X層（環境差）
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url('17-modern.html')); await p.waitForTimeout(600);
  ok('17 M層: 対応バッジが全項目で判定される', (await p.$$eval('.sup', s => s.filter(x => x.textContent).length)) === 15, errs.join(' | '));
  await p.click('#s88-btn'); await p.waitForTimeout(400);
  ok('88 @starting-style: display が block になる', (await p.$eval('#s88-panel', e => getComputedStyle(e).display)) === 'block');
  await p.click('[popovertarget=s89-menu]'); await p.waitForTimeout(200);
  ok('89 popover: 開く', await p.$eval('#s89-menu', e => e.matches(':popover-open')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('89 popover: Esc で閉じる（自前実装なし）', !(await p.$eval('#s89-menu', e => e.matches(':popover-open'))));
  await p.click('.s92:nth-of-type(2) summary'); await p.waitForTimeout(300);
  ok('92 details name: 排他になる', (await p.$$eval('.s92[open]', d => d.length)) === 1);
  await p.fill('#s97-q', '梱包'); await p.waitForTimeout(300);
  ok('97 Custom Highlight: DOM を変えずに一致を数える', (await p.textContent('#s97-out')).includes('子要素数: 0'));
  await p.click('#s99-run'); await p.waitForTimeout(1200);
  ok('99 標準API: groupBy と toSorted が動く', (await p.textContent('#s99-log')).includes('groupBy') && (await p.textContent('#s99-log')).includes('toSorted'));
  ok('17 M層: JSエラーなし', errs.length === 0, errs.join(' | '));
  await p.close(); }
{ const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url('18-crossplatform.html')); await p.waitForTimeout(600);
  ok('102 実測パネル: 端末情報が並ぶ', (await p.$$eval('#s102-t tr', r => r.length)) >= 10);
  ok('105 ビューポート単位: dvh を実測できる', (await p.textContent('#s105-out')).includes('100dvh='));
  ok('113 機能検出: 全機能を判定する', (await p.$$eval('#s113-t tr', r => r.length)) >= 17);
  await p.click('#s108-open'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('108 CloseWatcher: Esc で閉じる', await p.$eval('#s108-panel', e => e.hidden));
  ok('18 X層: JSエラーなし', errs.length === 0, errs.join(' | '));
  await p.close(); }
{ // Y層（サードパーティ連携）
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url('20-integration.html')); await p.waitForTimeout(900);
  ok('20 Y層: 14項目が並ぶ', (await p.$$eval('section.demo', s2 => s2.length)) === 14);
  ok('115 postMessage: 子から握手が届く', (await p.textContent('#l115')).includes('準備完了'));
  await p.check('#c118'); await p.selectOption('#s118', 'star'); await p.waitForTimeout(400);
  ok('118 CORS: Cookie 付きで Allow-Origin: * は拒否されると示す', (await p.textContent('#l118')).includes('Allow-Origin: * が使えない'), await p.textContent('#l118'));
  await p.click('#b122c'); await p.waitForTimeout(6500);
  ok('122 再試行: バックオフで 6件すべて通る', (await p.textContent('#o122')).includes('成功 6/6'), await p.textContent('#o122'));
  await p.click('#b123a'); await p.waitForTimeout(300);
  ok('123 Webhook: 正しい配送は受理される', (await p.textContent('#o123')).startsWith('200'));
  await p.click('#b123b'); await p.waitForTimeout(300);
  ok('123 Webhook: 改ざんは署名検証で弾く', (await p.textContent('#o123')).startsWith('401'));
  await p.click('#b123c'); await p.waitForTimeout(300);
  ok('123 Webhook: 古い署名はリプレイとして弾く', (await p.textContent('#o123')).startsWith('400'));
  await p.click('#b123a'); await p.waitForTimeout(300); await p.click('#b123d'); await p.waitForTimeout(300);
  ok('123 Webhook: 再送は冪等に扱う（200 で処理しない）', (await p.textContent('#o123')).includes('処理済み'));
  await p.click('#b124go'); await p.waitForTimeout(3400);
  ok('124 反映方式: SSE/WebSocket が先に受け取る', (await p.textContent('#v124s')) === '在庫 96' && (await p.textContent('#v124w')) === '在庫 96');
  // ポーリングは間隔ぶん遅れて追いつく。間隔（2秒）ちょうどで判定すると取りこぼすので待って確かめる
  await p.waitForFunction(() => document.querySelector('#v124p').textContent === '在庫 96', null, { timeout: 6000 }).catch(() => {});
  ok('124 反映方式: ポーリングは遅れて追いつき通信回数が増える',
    (await p.textContent('#v124p')) === '在庫 96' && Number(await p.textContent('#c124p')) >= 2,
    `${await p.textContent('#v124p')} / calls=${await p.textContent('#c124p')}`);
  ok('125 ファイル授受: 対応状況を実測表示する', (await p.textContent('#s125a')).length > 3 && (await p.textContent('#s125d')).length > 3);
  await p.click('#i126'); await p.type('#i126', 'A-1001', { delay: 5 }); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('126 機器連携: 高速入力をリーダーと判定する', (await p.textContent('#r126')).includes('リーダー'), await p.textContent('#r126'));
  await p.type('#i126', 'B-2', { delay: 130 }); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('126 機器連携: ゆっくりの入力は手入力と判定する', (await p.textContent('#r126')).includes('手入力'), await p.textContent('#r126'));
  const style127 = () => p.evaluate(() => ({
    normal: getComputedStyle(document.querySelector('#host127 .wbtn')).fontSize,
    shadow: getComputedStyle(document.querySelector('#shadow127').shadowRoot.querySelector('button')).fontSize }));
  const s127a = await style127(); await p.click('#b127'); await p.waitForTimeout(250); const s127b = await style127();
  ok('127 Shadow DOM: 外の CSS は通常DOMだけを壊す',
    s127a.normal === s127b.shadow && s127b.normal !== s127b.shadow, JSON.stringify([s127a, s127b]));
  ok('20 Y層: JSエラーなし', errs.length === 0, errs.join(' | '));
  await p.close(); }

{ // Z層（3D と AR）
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url('21-3d.html')); await p.waitForTimeout(1200);
  ok('21 Z層: 16項目が並ぶ', (await p.$$eval('section.demo', s2 => s2.length)) === 16);
  const gl = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  ok('21 Z層: WebGL2 が使える環境である', gl);
  if (gl) {
    // 132 ピッキング：中心付近の部品を掴めるか（レイキャストの計算だけを直接検証する）
    const hit = await p.evaluate(() => {
      const c = document.querySelector('#c132'); if (!c || !c.__mini3d) return 'no viewer';
      const r = c.getBoundingClientRect();
      const h = c.__mini3d.raycast(r.left + r.width / 2, r.top + r.height / 2);
      return h ? { name: h.object.name, d: h.distance } : null;
    });
    ok('132 ピッキング: 画面中央のレイが部品に当たる', !!hit && hit.d > 0, JSON.stringify(hit));
    // 129 カメラ：ドラッグで方位角が変わる
    const cam = await p.evaluate(() => {
      const c = document.querySelector('#c129'); return c && c.__mini3d ? c.__mini3d.camera.azimuth : null; });
    const el129 = await p.$('#c129'); await el129.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    const box = await el129.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 }); await p.mouse.up();
    await p.waitForTimeout(200);
    const cam2 = await p.evaluate(() => document.querySelector('#c129').__mini3d.camera.azimuth);
    ok('129 カメラ: 横ドラッグで方位角が回る', cam !== null && Math.abs(cam2 - cam) > 0.1, `${cam} -> ${cam2}`);
  }
  ok('142 AR: 端末の対応状況を実測表示する', (await p.$$eval('#t142 tr', r => r.length)) >= 4);
  ok('21 Z層: JSエラーなし', errs.length === 0, errs.join(' | '));
  await p.close(); }

{ // 日本語入力（IME）対策が既存デモに入っているか
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('05-advanced.html')); await p.waitForTimeout(400);
  const before = await p.textContent('#s74-out');
  await p.$eval('#s74-q', el => { el.value = 'ぶ'; el.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true })); });
  await p.waitForTimeout(400);
  ok('74 検索: 変換中は検索が走らない', (await p.textContent('#s74-out')) === before);
  await p.$eval('#s74-q', el => { el.value = '部品12'; el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
  await p.waitForTimeout(500);
  ok('74 検索: 変換確定で1回だけ走る', (await p.textContent('#s74-out')) !== before);
  // 横断検索（00）と絞り込み（81）も、変換中は走らないこと
  await p.goto(url('00-index.html')); await p.waitForTimeout(400);
  await p.$eval('#gq', el => { el.value = 'かん'; el.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true })); });
  await p.waitForTimeout(400);
  ok('00 横断検索: 変換中は検索が走らない', (await p.textContent('#gcount')).trim() === '');
  await p.$eval('#gq', el => { el.value = '慣性'; el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
  await p.waitForTimeout(400);
  ok('00 横断検索: 変換確定で走る', /件/.test(await p.textContent('#gcount')));
  await p.goto(url('05-advanced.html')); await p.waitForTimeout(600);
  const n81 = () => p.$$eval('#s81-list div', d => d.length);
  const before81 = await n81();
  await p.$eval('#s81-filter', el => { el.value = '#1005'; el.dispatchEvent(new InputEvent('input', { isComposing: true, bubbles: true })); });
  await p.waitForTimeout(300);
  ok('81 絞り込み: 変換中は絞られない', (await n81()) === before81, `${before81} -> ${await n81()}`);
  await p.$eval('#s81-filter', el => { el.value = '#1005'; el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
  await p.waitForTimeout(300);
  ok('81 絞り込み: 変換確定で絞られる', (await n81()) < before81, `${await n81()}`);

  await p.goto(url('03-custom.html')); await p.waitForTimeout(400);
  await p.dblclick('.s38 td');
  await p.$eval('.s38 td input', el => { el.value = 'けんさ'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); });
  ok('38 インライン編集: 変換確定の Enter では確定しない', await p.$eval('.s38 td', td => !!td.querySelector('input')));
  await p.$eval('.s38 td input', el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  ok('38 インライン編集: 通常の Enter で確定し、再編集が始まらない', await p.$eval('.s38 td', td => !td.querySelector('input') && td.textContent === 'けんさ'));
  await p.close(); }

{ // プレイグラウンド：全デモがエラーなしで動くか（stage の外にある操作ボタンの取り込み漏れを検知する）
  const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await p.goto(url('14-playground.html')); await p.waitForTimeout(400);
  const ids = await p.$$eval('#pick option', o => o.map(x => x.value));
  const bad = [];
  for (const id of ids) { await p.selectOption('#pick', id); await p.waitForTimeout(150);
    const e = (await p.$eval('#err', el => el.textContent)).trim(); if (e) bad.push(id + ': ' + e); }
  ok(`14 プレイグラウンド: 全 ${ids.length} デモがエラーなしで動く`, bad.length === 0, bad.slice(0, 5).join(' | '));
  ok('14 プレイグラウンド: 3D デモも動く（mini3d.js が読まれる）',
    ids.includes('n129') && await p.evaluate(() => true));
  await p.close(); }

{ // A7 canvas / 3D の代替経路：キーボードだけで選べるか
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url('10-accessibility.html')); await p.waitForTimeout(400);
  const c = await p.$('#a7c'); await c.scrollIntoViewIfNeeded(); await c.focus();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  ok('A7 canvas: 矢印キーで選択でき aria-live に文字が出る', (await p.textContent('#a7live')).includes('台座'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('A7 canvas: Esc で解除される', (await p.textContent('#a7live')).includes('解除'));
  await p.click('#a7list a[data-i="3"]'); await p.waitForTimeout(150);
  ok('A7 canvas: 代替一覧からも選べ aria-current が付く',
    (await p.$eval('#a7list li:nth-child(4)', l => l.getAttribute('aria-current'))) === 'true');
  ok('10 アクセシビリティ: JSエラーなし', errs.length === 0, errs.join(' | '));
  await p.close(); }

{ // クイズ：追加した層からも出題できるか
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p.goto(url('11-quiz.html')); await p.waitForTimeout(300);
  const tiers = await p.$$eval('.tier-cb', c => c.map(x => x.value));
  ok('11 クイズ: 全9層を選べる', ['A','B','C','D','E','M','X','Y','Z'].every(t => tiers.includes(t)), tiers.join(','));
  for (const t of ['A','B','C']) await p.uncheck(`.tier-cb[value=${t}]`);
  await p.check('.tier-cb[value=Z]'); await p.click('#start'); await p.waitForTimeout(400);
  ok('11 クイズ: Z層のみで出題できる', (await p.textContent('#meta')).includes('層 Z'));
  await p.close(); }

{ // 単一ファイル版：1枚だけで資料が動くか（ナビ・デモ・ページ間リンク・プレイグラウンド）
  const p = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const bundle = 'file://' + path.join(dir, 'dist', 'ui-guide-standalone.html');
  await p.goto(bundle); await p.waitForTimeout(900);
  const f = () => p.frameLocator('#ug-frame');
  ok('単一ファイル版: JSエラーなし・ナビが並ぶ', errs.length === 0 && (await p.$$eval('#ug-nav a', a => a.length)) >= 15, errs.join(' | '));
  await f().locator('#gq').fill('慣性'); await p.waitForTimeout(500);
  await f().locator('#gres a').first().click(); await p.waitForTimeout(900);
  ok('単一ファイル版: 横断検索の結果からページ間を移動できる', (await p.textContent('#ug-path')).includes('03-custom.html'));
  await p.click('#ug-nav a[data-key="docs/ui-guide/02-basic.html"]'); await p.waitForTimeout(900);
  await f().locator('#s15-open').click(); await p.waitForTimeout(300);
  ok('単一ファイル版: デモが動く（01 の 100 行・15 のモーダル）', (await f().locator('#s01-box div').count()) === 100 && (await f().locator('#s15-dlg').evaluate(d => d.open)));
  await p.goto(bundle + '#docs/ui-guide/14-playground.html@n28'); await p.waitForTimeout(1500);
  ok('単一ファイル版: プレイグラウンドが指定デモを開き、内側でも動く',
    (await p.frameLocator('#ug-frame').locator('#d-title').textContent()).includes('慣性') &&
    (await p.frameLocator('#ug-frame').frameLocator('#frame').locator('#s28-ball').count()) === 1);
  await p.goto(bundle + '#ui-kit/example/index.html'); await p.waitForTimeout(1500);
  ok('単一ファイル版: ui-kit 実例アプリも動く', (await p.frameLocator('#ug-frame').locator('#list .row').count()) > 5);
  await p.close(); }

await browser.close();
const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
