// virtual-list.js — 固定行高の仮想スクロール
// 参照デモ: 23 仮想スクロール / 71 大規模グリッド / 72 ツリーグリッド
//
//   const vl = createVirtualList(viewEl, { rowHeight: 28, count: 100000, overscan: 2,
//     renderRow: (index) => '<div class="row">…</div>'   // 文字列か Element
//   });
//   vl.setCount(n) / vl.refresh() / vl.scrollToIndex(i) / vl.range() → {start, end} / vl.dispose()
//
// DOM: view の中に spacer(全体高) > rows(表示分だけ) を作る。view は overflow:auto であること。
export function createVirtualList(view, { rowHeight, count = 0, overscan = 2, renderRow }) {
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
export function flattenTree(nodes, { children = 'children', open = 'open' } = {}) {
  const out = [];
  const walk = (list, depth) => list.forEach(n => { out.push({ node: n, depth }); if (n[open] && n[children]?.length) walk(n[children], depth + 1); });
  walk(nodes, 0);
  return out;
}
