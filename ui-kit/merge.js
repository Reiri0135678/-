// merge.js — 3方向マージ（競合解決）
// 参照デモ: 78 競合解決 / 77 差分表示
//
//   threeWayMerge(base, mine, theirs, { prefer: 'mine' })
//   → { merged, conflicts: [{ key, base, mine, theirs }], changes: { key: 'mine'|'theirs'|'both'|'none' } }
// 片方だけ変えた項目はその値、両方が別の値に変えた項目は conflict（prefer で暫定採用）。
export function threeWayMerge(base, mine, theirs, { prefer = 'mine' } = {}) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {}), ...Object.keys(theirs || {})]);
  const merged = {}, conflicts = [], changes = {};
  for (const k of keys) {
    const b = base?.[k], m = mine?.[k], t = theirs?.[k];
    const mc = m !== b, tc = t !== b;
    if (mc && tc && m !== t) { conflicts.push({ key: k, base: b, mine: m, theirs: t }); merged[k] = prefer === 'mine' ? m : t; changes[k] = 'both'; }
    else if (mc) { merged[k] = m; changes[k] = 'mine'; }
    else if (tc) { merged[k] = t; changes[k] = 'theirs'; }
    else { merged[k] = b; changes[k] = 'none'; }
  }
  return { merged, conflicts, changes };
}

// 単語単位の差分（LCS）: [{ type: 'same'|'del'|'ins', text }]
export function wordDiff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (type, text) => { const last = out[out.length - 1]; last && last.type === type ? (last.text += text) : out.push({ type, text }); };
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push('del', A[i++]); }
    else { push('ins', B[j++]); }
  }
  while (i < n) push('del', A[i++]); while (j < m) push('ins', B[j++]);
  return out;
}
export function diffToHtml(parts) {
  const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return parts.map(p => p.type === 'same' ? esc(p.text) : `<${p.type}>${esc(p.text)}</${p.type}>`).join('');
}
