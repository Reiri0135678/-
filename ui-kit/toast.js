// toast.js — 通知トースト（積み上げ・自動消去・ホバーで停止・件数上限・aria-live）
// 参照デモ: 16 トースト
//
//   const toast = createToaster({ host: document.body, max: 3, duration: 2500, position: 'bottom-right' });
//   toast.show('保存しました');  toast.show('失敗', { kind: 'error', duration: 4000 });
//   toast.dispose()
// スタイルはクラス .uk-toast-host / .uk-toast / .uk-toast.error に自分で当てる（最小限のインラインは付与）。
export function createToaster({ host = document.body, max = 3, duration = 2500, position = 'bottom-right' } = {}) {
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
