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
export function createDrag(el, opts = {}) {
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
export function constrain(ctx, { grid = 0, axisLock = ctx.shift, snap = ctx.alt } = {}) {
  let { dx, dy } = ctx;
  if (axisLock) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
  if (snap && grid > 0) { dx = Math.round(dx / grid) * grid; dy = Math.round(dy / grid) * grid; }
  return { dx, dy };
}
