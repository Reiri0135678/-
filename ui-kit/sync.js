// sync.js — 複数ウィンドウ間の状態同期（BroadcastChannel + storage イベントの2経路）
// 参照デモ: 85 マルチウィンドウ同期
//
//   const ch = createSyncChannel('app.state', { onState: (state, from) => render(state) });
//   ch.publish(state)   // 自分以外の全ウィンドウへ
//   ch.hello(() => state) // 起動時: 既存ウィンドウに現状を問い合わせる（応答は onState に届く）
//   ch.dispose()
export function createSyncChannel(name, { onState, storage = globalThis.localStorage } = {}) {
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
