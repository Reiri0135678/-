// camera.js — 画面座標 ⇄ ワールド座標の変換（パン・ズームの中核）
// 参照デモ: 43 無限キャンバス / 44 ズーム中心維持 / 45 ミニマップ / 84 タイムライン
//
//   const cam = createCamera({ minScale: 0.25, maxScale: 4 });
//   cam.toWorld(sx, sy) / cam.toScreen(wx, wy) / cam.panBy(dx, dy) / cam.zoomAt(sx, sy, factor)
//   cam.transform → 'translate(x px, y px) scale(s)'（CSS transform 用）
//   cam.subscribe(fn) で変更通知
export function createCamera({ x = 0, y = 0, scale = 1, minScale = 0.1, maxScale = 10 } = {}) {
  const subs = new Set();
  const cam = {
    x, y, scale,
    get transform() { return `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`; },
    toWorld: (sx, sy) => ({ x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale }),
    toScreen: (wx, wy) => ({ x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y }),
    panBy(dx, dy) { cam.x += dx; cam.y += dy; emit(); return cam; },
    // sx, sy（画面座標）を不動点として倍率を factor 倍する
    zoomAt(sx, sy, factor) {
      const w = cam.toWorld(sx, sy);
      cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * factor));
      cam.x = sx - w.x * cam.scale; cam.y = sy - w.y * cam.scale;
      emit(); return cam;
    },
    set(next) { Object.assign(cam, next); emit(); return cam; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  const emit = () => subs.forEach(fn => fn(cam));
  return cam;
}

// view 要素にパン（ドラッグ）とズーム（ホイール、カーソル基準）を取り付ける
//   attachPanZoom(viewEl, cam, { wheelSensitivity: 0.002 }) → dispose
export function attachPanZoom(view, cam, { wheelSensitivity = 0.002, filter } = {}) {
  let drag = null;
  const local = (e) => { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => { if (filter && !filter(e)) return; const p = local(e); drag = { x: p.x - cam.x, y: p.y - cam.y }; view.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag) return; const p = local(e); cam.set({ x: p.x - drag.x, y: p.y - drag.y }); };
  const up = () => { drag = null; };
  const wheel = (e) => { e.preventDefault(); const p = local(e); cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * wheelSensitivity)); };
  view.addEventListener('pointerdown', down); view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', wheel, { passive: false });
  return () => {
    view.removeEventListener('pointerdown', down); view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerup', up); view.removeEventListener('pointercancel', up);
    view.removeEventListener('wheel', wheel);
  };
}
