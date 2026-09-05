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
export function createOfflineQueue({ storageKey, send, isOnline = () => navigator.onLine, storage = globalThis.localStorage } = {}) {
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
