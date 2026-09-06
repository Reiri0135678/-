// retry.js — レート制限（429）と一時的な失敗に対する再試行
// 参照デモ: 122 レート制限と再試行 / 79 オフライン対応
//
//   const call = withRetry(async (body, { signal, idempotencyKey }) => {
//     const res = await fetch('/api/orders', {
//       method: 'POST', signal,
//       headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
//       body: JSON.stringify(body),
//     });
//     if (!res.ok) throw httpError(res);          // ← 429/5xx を投げると再試行の対象になる
//     return res.json();
//   }, { retries: 4, onRetry: (info) => showStatus(`再試行 ${info.attempt} 回目`) });
//
//   await call({ qty: 3 }, { idempotencyKey: 'order-1001' });
//
// 前提・副作用:
//  - 待ち時間は「指数バックオフ × ジッター」。全端末が同時に再開して再び詰まる（雪崩）のを防ぐ
//  - サーバが Retry-After を返したときは、その指示を最優先する
//  - 冪等キーは業務上のキーから作る（毎回ランダムにすると再送で二重登録になる）
//  - 冪等でない操作（同じ POST を2回受け付けてしまう API）には使わない。何を再試行してよいかは呼び出し側の責任

// fetch の Response から、再試行の判断に必要な情報を持つ Error を作る
export function httpError(res) {
  const err = new Error(`HTTP ${res.status}`);
  err.status = res.status;
  const ra = res.headers?.get?.('retry-after');
  if (ra != null) err.retryAfter = parseRetryAfter(ra);     // 秒。日付形式でも秒に直す
  return err;
}

// Retry-After は「秒数」または「HTTP-date」。どちらでも秒に直す
export function parseRetryAfter(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : Math.max(0, (t - Date.now()) / 1000);
}

// 既定の再試行条件：429（レート制限）・408（タイムアウト）・5xx（サーバ側の一時障害）・status 不明（通信断）
export const isTransient = err =>
  err?.name !== 'AbortError' &&
  (err?.status == null || err.status === 429 || err.status === 408 || err.status >= 500);

// attempt は 0 始まり。base * 2^attempt を上限で切り、ジッターで 0.5〜1.0 倍にばらす
export function backoffDelay(attempt, { baseMs = 300, maxMs = 30000, retryAfterSec = null, jitter = Math.random } = {}) {
  const base = retryAfterSec != null ? retryAfterSec * 1000 : Math.min(baseMs * 2 ** attempt, maxMs);
  return Math.min(base, maxMs) * (0.5 + jitter() * 0.5);
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }, { once: true });
});

// 1回の呼び出しを再試行つきにする
export async function retry(fn, {
  retries = 3, baseMs = 300, maxMs = 30000,
  shouldRetry = isTransient, onRetry = null, signal = null,
  jitter = Math.random, sleepFn = sleep,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted?.();
    try { return await fn({ attempt, signal }); }
    catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err, attempt)) throw err;
      const delay = backoffDelay(attempt, { baseMs, maxMs, retryAfterSec: err?.retryAfter ?? null, jitter });
      onRetry?.({ attempt: attempt + 1, delay, error: err });   // 画面に「再試行 n 回目・あと m 秒」を出すため
      await sleepFn(delay, signal);
    }
  }
  throw lastErr;
}

// 関数を包んで、呼ぶだけで再試行つきになるようにする。冪等キーは呼び出しごとに固定される
export function withRetry(fn, opts = {}) {
  return (arg, { idempotencyKey = null, signal = opts.signal ?? null } = {}) =>
    retry(({ attempt }) => fn(arg, { attempt, signal, idempotencyKey }), { ...opts, signal });
}

// 同時実行数を絞る（そもそも 429 を出さないのが最善。1000件を一気に投げない）
export function createLimiter(concurrency = 4) {
  let active = 0; const waiting = [];
  const next = () => { active--; waiting.shift()?.(); };
  return task => new Promise((resolve, reject) => {
    const run = () => { active++; Promise.resolve().then(task).then(resolve, reject).finally(next); };
    active < concurrency ? run() : waiting.push(run);
  });
}
