// position.js — ツールチップ / ポップオーバー / メニューの位置決め（反転・枠内補正）
// 参照デモ: 17 ツールチップ / 20 ドロップダウン / 39 コンテキストメニュー
//
//   const { left, top, placement } = computePosition(anchorRect, popRect, {
//     placement: 'top' | 'bottom' | 'left' | 'right',   // 希望する方向
//     align: 'center' | 'start' | 'end',                 // 直交方向の揃え
//     gap: 6,
//     bounds: { left, top, right, bottom },              // 収める範囲（省略時はビューポート）
//   });
// 戻り値は bounds と同じ座標系。希望方向に余白が無ければ反対側へ反転し、直交方向は枠内に押し込む。
export function computePosition(anchor, pop, { placement = 'top', align = 'center', gap = 6, bounds } = {}) {
  const b = bounds || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const fits = (p) => p === 'top' ? anchor.top - gap - pop.height >= b.top : p === 'bottom' ? anchor.bottom + gap + pop.height <= b.bottom
    : p === 'left' ? anchor.left - gap - pop.width >= b.left : anchor.right + gap + pop.width <= b.right;
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  let p = placement; if (!fits(p) && fits(opposite[p])) p = opposite[p];
  let left, top;
  const alongX = (p === 'top' || p === 'bottom');
  if (alongX) {
    top = p === 'top' ? anchor.top - gap - pop.height : anchor.bottom + gap;
    left = align === 'start' ? anchor.left : align === 'end' ? anchor.right - pop.width : anchor.left + anchor.width / 2 - pop.width / 2;
  } else {
    left = p === 'left' ? anchor.left - gap - pop.width : anchor.right + gap;
    top = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - pop.height : anchor.top + anchor.height / 2 - pop.height / 2;
  }
  left = Math.max(b.left, Math.min(left, b.right - pop.width));   // 枠内に押し込む
  top = Math.max(b.top, Math.min(top, b.bottom - pop.height));
  return { left, top, placement: p };
}

// クリック位置に出すメニュー用：右下に出し、はみ出す軸だけ反転
//   positionAtPoint({x, y}, popRect, bounds) → { left, top }
export function positionAtPoint(point, pop, bounds) {
  const b = bounds || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  let left = point.x, top = point.y;
  if (left + pop.width > b.right) left = Math.max(b.left, point.x - pop.width);
  if (top + pop.height > b.bottom) top = Math.max(b.top, point.y - pop.height);
  return { left, top };
}
