// split.js — 分割パネル（ガターのドラッグで幅を変更、最小幅、ダブルクリックで初期化）
// 参照デモ: 33 分割パネル / 80 ドッキング
//
//   const split = createSplit(containerEl, { sizes: [240, null], min: 120, gutter: 6, direction: 'horizontal',
//     onChange: (sizes) => save(sizes) });
//   split.setSizes([300, null]) / split.getSizes() / split.dispose()
// container は grid になり、子要素の間にガターが挿入される。sizes の null は 1fr（残り）。
export function createSplit(container, { sizes, min = 100, gutter = 6, direction = 'horizontal', onChange } = {}) {
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
