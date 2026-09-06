// search.js — デバウンス / あいまい検索 / ハイライト
// 参照デモ: 74 検索の型
export function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t); return d;
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 部分一致: 一致位置 1 箇所。null なら不一致
export function substringMatch(text, needle) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  return i < 0 ? null : { score: 1000 - i, ranges: [[i, i + needle.length]] };
}
// あいまい一致: needle の文字が順番に現れるか。連続 +8、先頭 +10、飛び越し減点、短いテキスト微優先
export function fuzzyMatch(text, needle) {
  const t = text.toLowerCase(), n = needle.toLowerCase();
  let ti = 0, score = 0, prev = -2; const ranges = [];
  for (const ch of n) {
    const i = t.indexOf(ch, ti); if (i < 0) return null;
    score += (i === prev + 1 ? 8 : 1) + (i === 0 ? 10 : 0) - (i - ti) * 0.1;
    if (ranges.length && ranges[ranges.length - 1][1] === i) ranges[ranges.length - 1][1] = i + 1; else ranges.push([i, i + 1]);
    prev = i; ti = i + 1;
  }
  return { score: score - text.length * 0.01, ranges };
}
// ranges を <mark> で囲んだ HTML（エスケープ済み）
export function highlight(text, ranges, tag = 'mark') {
  let out = '', pos = 0;
  for (const [a, b] of ranges) { out += esc(text.slice(pos, a)) + `<${tag}>` + esc(text.slice(a, b)) + `</${tag}>`; pos = b; }
  return out + esc(text.slice(pos));
}
// 一括検索してスコア順に返す
//   search(items, needle, { text: item => item.name, fuzzy: true, limit: 100 }) → [{ item, score, ranges }]
export function search(items, needle, { text = (x) => String(x), fuzzy = false, limit = Infinity } = {}) {
  if (!needle) return items.slice(0, limit).map(item => ({ item, score: 0, ranges: [] }));
  const match = fuzzy ? fuzzyMatch : substringMatch, hits = [];
  for (const item of items) { const m = match(text(item), needle); if (m) hits.push({ item, ...m }); }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
