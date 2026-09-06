// hotkeys.js — ショートカットキー登録
// 参照デモ: 35 ショートカット / 36 コマンドパレット
//
//   const dispose = registerHotkeys({
//     'mod+s': (e) => save(),        // mod = Windows: Ctrl / Mac: ⌘
//     'mod+shift+z': (e) => redo(),
//     'n': (e) => create(),          // 単独キーは入力欄内では発火しない（ignoreInputs）
//   }, { target: document, ignoreInputs: true });
// 内側の部品（focus-trap の Esc など）が preventDefault 済みのイベントは無視する（skipPrevented: true）。
// 日本語入力の変換中（isComposing）のキーも無視する。
export function registerHotkeys(map, { target = document, ignoreInputs = true, skipPrevented = true } = {}) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const norm = (combo) => combo.toLowerCase().split('+').map(k => k === 'mod' ? (isMac ? 'meta' : 'ctrl') : k).sort().join('+');
  const table = new Map(Object.entries(map).map(([k, fn]) => [norm(k), fn]));
  const typing = () => { const a = target.activeElement || document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  const handler = (e) => {
    if (skipPrevented && e.defaultPrevented) return;
    if (e.isComposing || e.keyCode === 229) return;   // 日本語入力の変換中は無視する（229 は古い環境向けの保険）
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl'); if (e.metaKey) parts.push('meta'); if (e.altKey) parts.push('alt'); if (e.shiftKey) parts.push('shift');
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (!['control', 'meta', 'alt', 'shift'].includes(key)) parts.push(key);
    const fn = table.get(parts.sort().join('+'));
    if (!fn) return;
    if (ignoreInputs && typing() && !e.ctrlKey && !e.metaKey) return;   // 入力中は修飾なしキーを無視
    e.preventDefault(); fn(e);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
