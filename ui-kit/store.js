// store.js — 永続化ストア（ワークスペース状態・下書き・レイアウト）
// 参照デモ: 75 フォーム下書き / 80 レイアウト保存 / 81 ワークスペース永続化
//
//   const ws = createPersistentStore('app.workspace', { tab: 'orders', filter: '', scroll: 0 }, { debounceMs: 200 });
//   ws.get() / ws.set({ tab: 'parts' }) / ws.reset() / ws.subscribe(fn) / ws.flush()
// set はマージ。保存はデバウンスされる（連続スクロール等で書き込み過多にならない）。
export function createPersistentStore(key, defaults, { debounceMs = 200, storage = globalThis.localStorage } = {}) {
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
