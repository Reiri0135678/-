/* ui-kit 2026-09-05 — 自動生成（node ui-kit/build.mjs）。編集は各モジュール側で行う */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.UIKit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

// ---- drag.js ----
// drag.js — ドラッグ操作の共通基盤（状態機械 + ポインタキャプチャ + 修飾キー制約）
// 参照デモ: 02 パン / 49 ポインタキャプチャ / 51 修飾キー / 52 状態機械
//
// 使い方:
//   const dispose = createDrag(el, {
//     threshold: 4,                  // これ以上動いたら dragging（未満で離せば click 扱い）
//     onStart(ctx) {}, onMove(ctx) {}, onEnd(ctx) {}, onClick(ctx) {}, onCancel(ctx) {},
//   });
//   ctx = { dx, dy, x, y, startX, startY, event, shift, alt, ctrl, meta, state }
//
// 副作用: el に pointer 系リスナーを追加し、touch-action:none を設定する。dispose() で解除。
function createDrag(el, opts = {}) {
  const { threshold = 4, capture = true, button = 0 } = opts;
  let state = 'idle', start = null, pointerId = null;
  const prevTouchAction = el.style.touchAction;
  el.style.touchAction = 'none';

  const ctxOf = (e) => ({
    x: e.clientX, y: e.clientY, startX: start.x, startY: start.y,
    dx: e.clientX - start.x, dy: e.clientY - start.y,
    shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, event: e, state,
  });
  const down = (e) => {
    if (state !== 'idle' || (e.pointerType === 'mouse' && e.button !== button)) return;
    if (opts.filter && !opts.filter(e)) return;
    start = { x: e.clientX, y: e.clientY }; pointerId = e.pointerId; state = 'pressed';
    if (capture) el.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (state === 'idle' || e.pointerId !== pointerId) return;
    if (state === 'pressed') {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < threshold) return;
      state = 'dragging'; opts.onStart?.(ctxOf(e));
    }
    opts.onMove?.(ctxOf(e));
  };
  const up = (e) => {
    if (state === 'idle' || e.pointerId !== pointerId) return;
    const was = state; state = 'idle';
    was === 'dragging' ? opts.onEnd?.(ctxOf(e)) : opts.onClick?.(ctxOf(e));
    start = null; pointerId = null;
  };
  const cancel = (e) => {
    if (state === 'idle') return;
    const was = state; state = 'idle';
    if (was === 'dragging') opts.onCancel?.(ctxOf(e));
    start = null; pointerId = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
    el.style.touchAction = prevTouchAction;
  };
}

// 修飾キーによる移動量の制約（51）
//   constrain({dx, dy, shift, alt}, { grid: 20 }) → { dx, dy }
//   shift: 軸固定（大きい方の軸だけ残す） / alt: grid に吸着
function constrain(ctx, { grid = 0, axisLock = ctx.shift, snap = ctx.alt } = {}) {
  let { dx, dy } = ctx;
  if (axisLock) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
  if (snap && grid > 0) { dx = Math.round(dx / grid) * grid; dy = Math.round(dy / grid) * grid; }
  return { dx, dy };
}


// ---- camera.js ----
// camera.js — 画面座標 ⇄ ワールド座標の変換（パン・ズームの中核）
// 参照デモ: 43 無限キャンバス / 44 ズーム中心維持 / 45 ミニマップ / 84 タイムライン
//
//   const cam = createCamera({ minScale: 0.25, maxScale: 4 });
//   cam.toWorld(sx, sy) / cam.toScreen(wx, wy) / cam.panBy(dx, dy) / cam.zoomAt(sx, sy, factor)
//   cam.transform → 'translate(x px, y px) scale(s)'（CSS transform 用）
//   cam.subscribe(fn) で変更通知
function createCamera({ x = 0, y = 0, scale = 1, minScale = 0.1, maxScale = 10 } = {}) {
  const subs = new Set();
  const cam = {
    x, y, scale,
    get transform() { return `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`; },
    toWorld: (sx, sy) => ({ x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale }),
    toScreen: (wx, wy) => ({ x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y }),
    panBy(dx, dy) { cam.x += dx; cam.y += dy; emit(); return cam; },
    // sx, sy（画面座標）を不動点として倍率を factor 倍する
    zoomAt(sx, sy, factor) {
      const w = cam.toWorld(sx, sy);
      cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * factor));
      cam.x = sx - w.x * cam.scale; cam.y = sy - w.y * cam.scale;
      emit(); return cam;
    },
    set(next) { Object.assign(cam, next); emit(); return cam; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  const emit = () => subs.forEach(fn => fn(cam));
  return cam;
}

// view 要素にパン（ドラッグ）とズーム（ホイール、カーソル基準）を取り付ける
//   attachPanZoom(viewEl, cam, { wheelSensitivity: 0.002 }) → dispose
function attachPanZoom(view, cam, { wheelSensitivity = 0.002, filter } = {}) {
  let drag = null;
  const local = (e) => { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => { if (filter && !filter(e)) return; const p = local(e); drag = { x: p.x - cam.x, y: p.y - cam.y }; view.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag) return; const p = local(e); cam.set({ x: p.x - drag.x, y: p.y - drag.y }); };
  const up = () => { drag = null; };
  const wheel = (e) => { e.preventDefault(); const p = local(e); cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * wheelSensitivity)); };
  view.addEventListener('pointerdown', down); view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', wheel, { passive: false });
  return () => {
    view.removeEventListener('pointerdown', down); view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerup', up); view.removeEventListener('pointercancel', up);
    view.removeEventListener('wheel', wheel);
  };
}


// ---- virtual-list.js ----
// virtual-list.js — 固定行高の仮想スクロール
// 参照デモ: 23 仮想スクロール / 71 大規模グリッド / 72 ツリーグリッド
//
//   const vl = createVirtualList(viewEl, { rowHeight: 28, count: 100000, overscan: 2,
//     renderRow: (index) => '<div class="row">…</div>'   // 文字列か Element
//   });
//   vl.setCount(n) / vl.refresh() / vl.scrollToIndex(i) / vl.range() → {start, end} / vl.dispose()
//
// DOM: view の中に spacer(全体高) > rows(表示分だけ) を作る。view は overflow:auto であること。
function createVirtualList(view, { rowHeight, count = 0, overscan = 2, renderRow }) {
  const spacer = document.createElement('div');
  const rows = document.createElement('div');
  spacer.appendChild(rows); view.appendChild(spacer);
  let total = count, last = { start: -1, end: -1 };

  const render = (force = false) => {
    const start = Math.max(0, Math.floor(view.scrollTop / rowHeight) - overscan);
    const end = Math.min(total, Math.ceil((view.scrollTop + view.clientHeight) / rowHeight) + overscan);
    if (!force && start === last.start && end === last.end) return;
    last = { start, end };
    rows.style.transform = `translateY(${start * rowHeight}px)`;
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const r = renderRow(i);
      if (typeof r === 'string') { const t = document.createElement('template'); t.innerHTML = r; frag.appendChild(t.content); }
      else frag.appendChild(r);
    }
    rows.replaceChildren(frag);
  };
  const setCount = (n) => {
    total = n; spacer.style.height = total * rowHeight + 'px';
    const max = Math.max(0, total * rowHeight - view.clientHeight);
    if (view.scrollTop > max) view.scrollTop = max;   // 行数が減ったときにブラウザの clamp を待たず自分で合わせる
    render(true);
  };
  const onScroll = () => render();
  view.addEventListener('scroll', onScroll);
  const ro = new ResizeObserver(() => render(true)); ro.observe(view);
  setCount(total);
  return {
    setCount, refresh: () => render(true), range: () => ({ ...last }),
    scrollToIndex: (i) => { view.scrollTop = i * rowHeight; },
    dispose() { view.removeEventListener('scroll', onScroll); ro.disconnect(); spacer.remove(); },
  };
}

// ツリーを「展開中ノードだけの平坦配列」にする（72）
//   flattenTree(nodes, { children: 'children', open: 'open' }) → [{ node, depth }]
function flattenTree(nodes, { children = 'children', open = 'open' } = {}) {
  const out = [];
  const walk = (list, depth) => list.forEach(n => { out.push({ node: n, depth }); if (n[open] && n[children]?.length) walk(n[children], depth + 1); });
  walk(nodes, 0);
  return out;
}


// ---- undo.js ----
// undo.js — スナップショット方式の履歴（Undo / Redo）
// 参照デモ: 37
//
//   const h = createHistory(initialState, { limit: 100 });
//   h.commit(nextState) / h.undo() / h.redo() / h.state / h.canUndo / h.canRedo / h.subscribe(fn)
// 状態は不変オブジェクトとして扱う（commit には新しいオブジェクトを渡す）。
function createHistory(initial, { limit = 100 } = {}) {
  let past = [], future = [], state = initial;
  const subs = new Set(), emit = () => subs.forEach(fn => fn(state));
  return {
    get state() { return state; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) { past.push(state); if (past.length > limit) past.shift(); future = []; state = next; emit(); return state; },
    undo() { if (!past.length) return state; future.push(state); state = past.pop(); emit(); return state; },
    redo() { if (!future.length) return state; past.push(state); state = future.pop(); emit(); return state; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}


// ---- hotkeys.js ----
// hotkeys.js — ショートカットキー登録
// 参照デモ: 35 ショートカット / 36 コマンドパレット
//
//   const dispose = registerHotkeys({
//     'mod+s': (e) => save(),        // mod = Windows: Ctrl / Mac: ⌘
//     'mod+shift+z': (e) => redo(),
//     'n': (e) => create(),          // 単独キーは入力欄内では発火しない（ignoreInputs）
//   }, { target: document, ignoreInputs: true });
// 内側の部品（focus-trap の Esc など）が preventDefault 済みのイベントは無視する（skipPrevented: true）。
function registerHotkeys(map, { target = document, ignoreInputs = true, skipPrevented = true } = {}) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const norm = (combo) => combo.toLowerCase().split('+').map(k => k === 'mod' ? (isMac ? 'meta' : 'ctrl') : k).sort().join('+');
  const table = new Map(Object.entries(map).map(([k, fn]) => [norm(k), fn]));
  const typing = () => { const a = target.activeElement || document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  const handler = (e) => {
    if (skipPrevented && e.defaultPrevented) return;
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl'); if (e.metaKey) parts.push('meta'); if (e.altKey) parts.push('alt'); if (e.shiftKey) parts.push('shift');
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);
    const fn = table.get(parts.sort().join('+'));
    if (!fn) return;
    if (ignoreInputs && typing() && !e.ctrlKey && !e.metaKey) return;   // 入力中は修飾なしキーを無視
    e.preventDefault(); fn(e);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}


// ---- search.js ----
// search.js — デバウンス / あいまい検索 / ハイライト
// 参照デモ: 74 検索の型
function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t); return d;
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 部分一致: 一致位置 1 箇所。null なら不一致
function substringMatch(text, needle) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  return i < 0 ? null : { score: 1000 - i, ranges: [[i, i + needle.length]] };
}
// あいまい一致: needle の文字が順番に現れるか。連続 +8、先頭 +10、飛び越し減点、短いテキスト微優先
function fuzzyMatch(text, needle) {
  const t = text.toLowerCase(), n = needle.toLowerCase();
  let ti = 0, score = 0, prev = -2; const ranges = [];
  for (const ch of n) {
    const i = t.indexOf(ch, ti); if (i < 0) return null;
    score += (i === prev + 1 ? 8 : 1) + (i === 0 ? 10 : 0) - (i - ti) * 0.1;
    if (ranges.length && ranges[ranges.length - 1][1] === i) ranges[ranges.length - 1][1] = i + 1; else ranges.push([i, i + 1]);
    prev = i; ti = i + 1;
  }
  return { score: score - text.length * 0.01, ranges };
}
// ranges を <mark> で囲んだ HTML（エスケープ済み）
function highlight(text, ranges, tag = 'mark') {
  let out = '', pos = 0;
  for (const [a, b] of ranges) { out += esc(text.slice(pos, a)) + `<${tag}>` + esc(text.slice(a, b)) + `</${tag}>`; pos = b; }
  return out + esc(text.slice(pos));
}
// 一括検索してスコア順に返す
//   search(items, needle, { text: item => item.name, fuzzy: true, limit: 100 }) → [{ item, score, ranges }]
function search(items, needle, { text = (x) => String(x), fuzzy = false, limit = Infinity } = {}) {
  if (!needle) return items.slice(0, limit).map(item => ({ item, score: 0, ranges: [] }));
  const match = fuzzy ? fuzzyMatch : substringMatch, hits = [];
  for (const item of items) { const m = match(text(item), needle); if (m) hits.push({ item, ...m }); }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}


// ---- offline-queue.js ----
// offline-queue.js — オフライン時の操作キューと再送
// 参照デモ: 79 オフライン対応 / 57 楽観的更新
//
//   const q = createOfflineQueue({
//     storageKey: 'app.queue',
//     send: async (job) => { await api.put(job) },      // 失敗は throw（キューに残る）
//     isOnline: () => navigator.onLine,                  // 任意
//   });
//   q.push(job) / q.flush() / q.size / q.jobs / q.subscribe(fn)
// 送信は先頭から順に。1件失敗したらそこで止め、次の flush（online イベント or 手動）で再開。
function createOfflineQueue({ storageKey, send, isOnline = () => navigator.onLine, storage = globalThis.localStorage } = {}) {
  let jobs = []; try { jobs = JSON.parse(storage?.getItem(storageKey) || '[]'); } catch {}
  let busy = false; const subs = new Set();
  const persist = () => { try { storage?.setItem(storageKey, JSON.stringify(jobs)); } catch {} subs.forEach(fn => fn(api)); };
  const api = {
    get size() { return jobs.length; }, get jobs() { return jobs.slice(); }, get busy() { return busy; },
    push(job) { jobs.push({ id: Date.now() + Math.random(), ...job }); persist(); return api.flush(); },
    async flush() {
      if (busy) return { sent: 0, failed: null };
      busy = true; let sent = 0, failed = null;
      try {
        while (jobs.length && isOnline()) {
          const job = jobs[0];
          try { await send(job); jobs.shift(); sent++; persist(); }
          catch (err) { failed = { job, err }; break; }
        }
      } finally { busy = false; }
      subs.forEach(fn => fn(api));
      return { sent, failed };
    },
    clear() { jobs = []; persist(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  globalThis.addEventListener?.('online', () => api.flush());
  return api;
}


// ---- merge.js ----
// merge.js — 3方向マージ（競合解決）
// 参照デモ: 78 競合解決 / 77 差分表示
//
//   threeWayMerge(base, mine, theirs, { prefer: 'mine' })
//   → { merged, conflicts: [{ key, base, mine, theirs }], changes: { key: 'mine'|'theirs'|'both'|'none' } }
// 片方だけ変えた項目はその値、両方が別の値に変えた項目は conflict（prefer で暫定採用）。
function threeWayMerge(base, mine, theirs, { prefer = 'mine' } = {}) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {}), ...Object.keys(theirs || {})]);
  const merged = {}, conflicts = [], changes = {};
  for (const k of keys) {
    const b = base?.[k], m = mine?.[k], t = theirs?.[k];
    const mc = m !== b, tc = t !== b;
    if (mc && tc && m !== t) { conflicts.push({ key: k, base: b, mine: m, theirs: t }); merged[k] = prefer === 'mine' ? m : t; changes[k] = 'both'; }
    else if (mc) { merged[k] = m; changes[k] = 'mine'; }
    else if (tc) { merged[k] = t; changes[k] = 'theirs'; }
    else { merged[k] = b; changes[k] = 'none'; }
  }
  return { merged, conflicts, changes };
}

// 単語単位の差分（LCS）: [{ type: 'same'|'del'|'ins', text }]
function wordDiff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (type, text) => { const last = out[out.length - 1]; last && last.type === type ? (last.text += text) : out.push({ type, text }); };
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push('del', A[i++]); }
    else { push('ins', B[j++]); }
  }
  while (i < n) push('del', A[i++]); while (j < m) push('ins', B[j++]);
  return out;
}
function diffToHtml(parts) {
  const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return parts.map(p => p.type === 'same' ? esc(p.text) : `<${p.type}>${esc(p.text)}</${p.type}>`).join('');
}


// ---- store.js ----
// store.js — 永続化ストア（ワークスペース状態・下書き・レイアウト）
// 参照デモ: 75 フォーム下書き / 80 レイアウト保存 / 81 ワークスペース永続化
//
//   const ws = createPersistentStore('app.workspace', { tab: 'orders', filter: '', scroll: 0 }, { debounceMs: 200 });
//   ws.get() / ws.set({ tab: 'parts' }) / ws.reset() / ws.subscribe(fn) / ws.flush()
// set はマージ。保存はデバウンスされる（連続スクロール等で書き込み過多にならない）。
function createPersistentStore(key, defaults, { debounceMs = 200, storage = globalThis.localStorage } = {}) {
  let state = { ...defaults };
  try { Object.assign(state, JSON.parse(storage?.getItem(key) || '{}')); } catch {}
  const subs = new Set(); let timer = null;
  const write = () => { timer = null; try { storage?.setItem(key, JSON.stringify(state)); } catch {} };
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach(fn => fn(state)); clearTimeout(timer); timer = setTimeout(write, debounceMs); return state; },
    flush() { clearTimeout(timer); write(); },
    reset() { state = { ...defaults }; try { storage?.removeItem(key); } catch {} subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}


// ---- sync.js ----
// sync.js — 複数ウィンドウ間の状態同期（BroadcastChannel + storage イベントの2経路）
// 参照デモ: 85 マルチウィンドウ同期
//
//   const ch = createSyncChannel('app.state', { onState: (state, from) => render(state) });
//   ch.publish(state)   // 自分以外の全ウィンドウへ
//   ch.hello(() => state) // 起動時: 既存ウィンドウに現状を問い合わせる（応答は onState に届く）
//   ch.dispose()
function createSyncChannel(name, { onState, storage = globalThis.localStorage } = {}) {
  const me = Math.random().toString(36).slice(2, 8), seen = new Set(), key = `sync:${name}`;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
  let current = null;
  const send = (msg) => {
    msg.id = `${me}:${Date.now()}:${Math.random()}`; msg.from = me;
    bc?.postMessage(msg);
    try { storage?.setItem(key, JSON.stringify(msg)); } catch {}
  };
  const receive = (msg) => {
    if (!msg || msg.from === me || seen.has(msg.id)) return; seen.add(msg.id);
    if (seen.size > 500) seen.clear();
    if (msg.type === 'hello') { if (current) send({ type: 'state', state: current() }); return; }
    if (msg.type === 'state') onState?.(msg.state, msg.from);
  };
  const onBc = (e) => receive(e.data);
  const onStorage = (e) => { if (e.key === key && e.newValue) { try { receive(JSON.parse(e.newValue)); } catch {} } };
  bc?.addEventListener('message', onBc);
  globalThis.addEventListener?.('storage', onStorage);
  return {
    id: me,
    publish: (state) => send({ type: 'state', state }),
    hello(getState) { current = getState; send({ type: 'hello' }); },
    dispose() { bc?.removeEventListener('message', onBc); bc?.close(); globalThis.removeEventListener?.('storage', onStorage); },
  };
}


// ---- focus-trap.js ----
// focus-trap.js — モーダル用のフォーカス管理（閉じ込め・背面 inert・復帰）
// 参照デモ: 58 フォーカス管理 / 15 モーダル
//
//   const trap = activateFocusTrap(modalEl, { inertTargets: [mainEl], onEscape: close, initialFocus: 'input' });
//   trap.release()   // 背面の inert を戻し、開く前の要素へフォーカスを返す
function activateFocusTrap(container, { inertTargets = [], onEscape, initialFocus } = {}) {
  const SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const opener = document.activeElement;
  const prevInert = inertTargets.map(el => [el, el.inert]);
  inertTargets.forEach(el => { if (!el.contains(container)) el.inert = true; });
  const focusables = () => [...container.querySelectorAll(SEL)].filter(el => el.getClientRects().length);
  const first = typeof initialFocus === 'string' ? container.querySelector(initialFocus) : initialFocus || focusables()[0] || container;
  if (first) { if (first === container && container.tabIndex < 0) container.tabIndex = -1; first.focus(); }
  const onKey = (e) => {
    if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape(e); return; }
    if (e.key !== 'Tab') return;
    const list = focusables(); if (!list.length) { e.preventDefault(); return; }
    const i = list.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }        // 先頭で Shift+Tab → 末尾へ
    else if (!e.shiftKey && (i === -1 || i === list.length - 1)) { e.preventDefault(); list[0].focus(); } // 末尾で Tab → 先頭へ
  };
  container.addEventListener('keydown', onKey);
  return {
    release() {
      container.removeEventListener('keydown', onKey);
      prevInert.forEach(([el, v]) => el.inert = v);
      opener?.focus?.();
    },
  };
}


// ---- position.js ----
// position.js — ツールチップ / ポップオーバー / メニューの位置決め（反転・枠内補正）
// 参照デモ: 17 ツールチップ / 20 ドロップダウン / 39 コンテキストメニュー
//
//   const { left, top, placement } = computePosition(anchorRect, popRect, {
//     placement: 'top' | 'bottom' | 'left' | 'right',   // 希望する方向
//     align: 'center' | 'start' | 'end',                 // 直交方向の揃え
//     gap: 6,
//     bounds: { left, top, right, bottom },              // 収める範囲（省略時はビューポート）
//   });
// 戻り値は bounds と同じ座標系。希望方向に余白が無ければ反対側へ反転し、直交方向は枠内に押し込む。
function computePosition(anchor, pop, { placement = 'top', align = 'center', gap = 6, bounds } = {}) {
  const b = bounds || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const fits = (p) => p === 'top' ? anchor.top - gap - pop.height >= b.top : p === 'bottom' ? anchor.bottom + gap + pop.height <= b.bottom
    : p === 'left' ? anchor.left - gap - pop.width >= b.left : anchor.right + gap + pop.width <= b.right;
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  let p = placement; if (!fits(p) && fits(opposite[p])) p = opposite[p];
  let left, top;
  const alongX = (p === 'top' || p === 'bottom');
  if (alongX) {
    top = p === 'top' ? anchor.top - gap - pop.height : anchor.bottom + gap;
    left = align === 'start' ? anchor.left : align === 'end' ? anchor.right - pop.width : anchor.left + anchor.width / 2 - pop.width / 2;
  } else {
    left = p === 'left' ? anchor.left - gap - pop.width : anchor.right + gap;
    top = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - pop.height : anchor.top + anchor.height / 2 - pop.height / 2;
  }
  left = Math.max(b.left, Math.min(left, b.right - pop.width));   // 枠内に押し込む
  top = Math.max(b.top, Math.min(top, b.bottom - pop.height));
  return { left, top, placement: p };
}

// クリック位置に出すメニュー用：右下に出し、はみ出す軸だけ反転
//   positionAtPoint({x, y}, popRect, bounds) → { left, top }
function positionAtPoint(point, pop, bounds) {
  const b = bounds || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  let left = point.x, top = point.y;
  if (left + pop.width > b.right) left = Math.max(b.left, point.x - pop.width);
  if (top + pop.height > b.bottom) top = Math.max(b.top, point.y - pop.height);
  return { left, top };
}


// ---- toast.js ----
// toast.js — 通知トースト（積み上げ・自動消去・ホバーで停止・件数上限・aria-live）
// 参照デモ: 16 トースト
//
//   const toast = createToaster({ host: document.body, max: 3, duration: 2500, position: 'bottom-right' });
//   toast.show('保存しました');  toast.show('失敗', { kind: 'error', duration: 4000 });
//   toast.dispose()
// スタイルはクラス .uk-toast-host / .uk-toast / .uk-toast.error に自分で当てる（最小限のインラインは付与）。
function createToaster({ host = document.body, max = 3, duration = 2500, position = 'bottom-right' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'uk-toast-host'; wrap.setAttribute('aria-live', 'polite'); wrap.setAttribute('role', 'status');
  const [v, h] = position.split('-');
  Object.assign(wrap.style, { position: 'fixed', [v]: '16px', [h]: '16px', display: 'flex', flexDirection: v === 'top' ? 'column' : 'column-reverse', gap: '8px', zIndex: 9999, pointerEvents: 'none' });
  host.appendChild(wrap);
  const live = [];                                                       // 表示中（退場アニメーション中は含めない）
  const dismiss = (el) => {
    const i = live.indexOf(el); if (i < 0) return; live.splice(i, 1);     // 先に「表示中」から外す（上限判定はこの配列で行う）
    el.classList.add('leaving'); const done = () => el.remove();
    el.addEventListener('animationend', done, { once: true }); setTimeout(done, 400);
  };
  return {
    show(message, { kind = 'info', duration: ms = duration } = {}) {
      while (live.length >= max) dismiss(live[0]);                       // 古いものから消す
      const el = document.createElement('div');
      el.className = `uk-toast ${kind}`; el.textContent = message; el.style.pointerEvents = 'auto';
      wrap.appendChild(el); live.push(el);
      let timer; const arm = () => { timer = setTimeout(() => dismiss(el), ms); };
      el.addEventListener('pointerenter', () => clearTimeout(timer));   // 読んでいる間は消さない
      el.addEventListener('pointerleave', arm);
      if (ms > 0) arm();
      return { dismiss: () => { clearTimeout(timer); dismiss(el); } };
    },
    dispose() { wrap.remove(); },
  };
}


// ---- sortable.js ----
// sortable.js — Pointer Events によるドラッグ並べ替え（縦リスト、FLIP 付き）
// 参照デモ: 32 ドラッグ並べ替え / 30 FLIP
//
//   const dispose = createSortable(listEl, {
//     handle: '.grip',                 // 省略時は子要素全体
//     onChange: (order) => {},         // 並び替え後の子要素配列
//   });
// 子要素は listEl の直下にあり、縦に並んでいる前提。持ち上げ中は .lifted クラスが付く。
function createSortable(list, { handle, onChange, liftedClass = 'lifted' } = {}) {
  let lifted = null, startY = 0, naturalTop = 0, pointerId = null;
  const animating = new WeakSet();   // FLIP 中の兄弟は当たり判定から外す（アニメーション中の rect で判定すると往復してしまう）
  const down = (e) => {
    const item = e.target.closest(`${list.tagName === 'UL' || list.tagName === 'OL' ? 'li' : ':scope > *'}`);
    if (!item || item.parentElement !== list) return;
    if (handle && !e.target.closest(handle)) return;
    lifted = item; pointerId = e.pointerId; startY = e.clientY; naturalTop = item.getBoundingClientRect().top;
    item.classList.add(liftedClass); item.style.position = 'relative'; item.style.zIndex = '2';
    item.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!lifted || e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    lifted.style.transform = `translateY(${dy}px)`;
    const cy = naturalTop + dy + lifted.offsetHeight / 2;
    for (const sib of list.children) {
      if (sib === lifted || animating.has(sib)) continue;
      const r = sib.getBoundingClientRect();
      if (cy < r.top || cy > r.bottom) continue;
      const liftedIsAfter = sib.compareDocumentPosition(lifted) & Node.DOCUMENT_POSITION_FOLLOWING;
      liftedIsAfter ? list.insertBefore(lifted, sib) : list.insertBefore(lifted, sib.nextSibling);
      const after = sib.getBoundingClientRect();
      const anim = sib.animate?.([{ transform: `translateY(${r.top - after.top}px)` }, { transform: 'none' }], { duration: 150 });
      if (anim) { animating.add(sib); anim.finished.then(() => animating.delete(sib), () => animating.delete(sib)); }
      const newNatural = lifted.getBoundingClientRect().top - dy;
      startY += newNatural - naturalTop; naturalTop = newNatural;
      lifted.style.transform = `translateY(${e.clientY - startY}px)`;
      break;
    }
  };
  const up = (e) => {
    if (!lifted || e.pointerId !== pointerId) return;
    lifted.style.transform = ''; lifted.style.position = ''; lifted.style.zIndex = ''; lifted.classList.remove(liftedClass);
    lifted = null; pointerId = null;
    onChange?.([...list.children]);
  };
  list.addEventListener('pointerdown', down); list.addEventListener('pointermove', move);
  list.addEventListener('pointerup', up); list.addEventListener('pointercancel', up);
  return () => { list.removeEventListener('pointerdown', down); list.removeEventListener('pointermove', move); list.removeEventListener('pointerup', up); list.removeEventListener('pointercancel', up); };
}


// ---- split.js ----
// split.js — 分割パネル（ガターのドラッグで幅を変更、最小幅、ダブルクリックで初期化）
// 参照デモ: 33 分割パネル / 80 ドッキング
//
//   const split = createSplit(containerEl, { sizes: [240, null], min: 120, gutter: 6, direction: 'horizontal',
//     onChange: (sizes) => save(sizes) });
//   split.setSizes([300, null]) / split.getSizes() / split.dispose()
// container は grid になり、子要素の間にガターが挿入される。sizes の null は 1fr（残り）。
function createSplit(container, { sizes, min = 100, gutter = 6, direction = 'horizontal', onChange } = {}) {
  const panes = [...container.children];
  const horizontal = direction === 'horizontal';
  const initial = sizes ? sizes.slice() : panes.map((_, i) => i === panes.length - 1 ? null : 200);
  let cur = initial.slice();
  const gutters = [];
  const apply = () => {
    const tpl = cur.map(s => s == null ? 'minmax(0, 1fr)' : `${s}px`).join(` ${gutter}px `);
    container.style.display = 'grid';
    container.style[horizontal ? 'gridTemplateColumns' : 'gridTemplateRows'] = tpl;
    onChange?.(cur.slice());
  };
  panes.slice(0, -1).forEach((pane, i) => {
    const g = document.createElement('div');
    g.className = 'uk-gutter'; g.style.cursor = horizontal ? 'col-resize' : 'row-resize'; g.style.touchAction = 'none'; g.style.userSelect = 'none';
    pane.after(g); gutters.push(g);
    let st = null;
    g.addEventListener('pointerdown', e => { st = { pos: horizontal ? e.clientX : e.clientY, size: panes[i][horizontal ? 'offsetWidth' : 'offsetHeight'] }; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e => {
      if (!st) return;
      const total = container[horizontal ? 'clientWidth' : 'clientHeight'];
      const others = cur.reduce((a, s, k) => a + (k === i || s == null ? 0 : s), 0) + gutter * (panes.length - 1);
      cur[i] = Math.max(min, Math.min(total - others - min, st.size + (horizontal ? e.clientX : e.clientY) - st.pos));
      apply();
    });
    g.addEventListener('pointerup', () => st = null);
    g.addEventListener('dblclick', () => { cur[i] = initial[i]; apply(); });
  });
  apply();
  return {
    getSizes: () => cur.slice(),
    setSizes: (s) => { cur = s.slice(); apply(); },
    dispose() { gutters.forEach(g => g.remove()); container.style.display = ''; container.style[horizontal ? 'gridTemplateColumns' : 'gridTemplateRows'] = ''; },
  };
}


  return { createDrag, constrain, createCamera, attachPanZoom, createVirtualList, flattenTree, createHistory, registerHotkeys, debounce, substringMatch, fuzzyMatch, highlight, search, createOfflineQueue, threeWayMerge, wordDiff, diffToHtml, createPersistentStore, createSyncChannel, activateFocusTrap, computePosition, positionAtPoint, createToaster, createSortable, createSplit };
});
