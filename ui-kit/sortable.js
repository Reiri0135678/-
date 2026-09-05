// sortable.js — Pointer Events によるドラッグ並べ替え（縦リスト、FLIP 付き）
// 参照デモ: 32 ドラッグ並べ替え / 30 FLIP
//
//   const dispose = createSortable(listEl, {
//     handle: '.grip',                 // 省略時は子要素全体
//     onChange: (order) => {},         // 並び替え後の子要素配列
//   });
// 子要素は listEl の直下にあり、縦に並んでいる前提。持ち上げ中は .lifted クラスが付く。
export function createSortable(list, { handle, onChange, liftedClass = 'lifted' } = {}) {
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
