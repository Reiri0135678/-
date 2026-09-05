// focus-trap.js — モーダル用のフォーカス管理（閉じ込め・背面 inert・復帰）
// 参照デモ: 58 フォーカス管理 / 15 モーダル
//
//   const trap = activateFocusTrap(modalEl, { inertTargets: [mainEl], onEscape: close, initialFocus: 'input' });
//   trap.release()   // 背面の inert を戻し、開く前の要素へフォーカスを返す
export function activateFocusTrap(container, { inertTargets = [], onEscape, initialFocus } = {}) {
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
