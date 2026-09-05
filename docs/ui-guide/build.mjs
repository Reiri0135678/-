// 教材のビルド（依存なし）: node docs/ui-guide/build.mjs
//  - assets/demo-data.js   : 各デモの HTML / CSS / JS を抽出（14-playground.html が使う）
//  - assets/search-index.js: 全ページの見出し・説明の索引（00-index.html の横断検索が使う）
// デモページを編集したら再実行する（verify.mjs が古さを検知する）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// <div class="stage ...> から対応する </div> までを div の入れ子を数えて切り出す
function extractStage(html) {
  const start = html.search(/<div class="stage[^"]*"/); if (start < 0) return '';
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let depth = 0, m;
  while ((m = re.exec(html))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return html.slice(start, m.index + 6); }
  return '';
}
const pages = fs.readdirSync(dir).filter(f => /^\d\d-.*\.html$/.test(f)).sort();
const demos = [], index = [];
for (const f of pages) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const title = strip((html.match(/<title>(.*?)<\/title>/) || [, f])[1]);
  const secRe = /<section class="demo" id="(\w+)">([\s\S]*?)<\/section>/g; let m;
  while ((m = secRe.exec(html))) {
    const [, id, body] = m;
    const h2 = strip((body.match(/<h2>([\s\S]*?)<\/h2>/) || [, ''])[1]);
    const what = strip((body.match(/<p class="what">([\s\S]*?)<\/p>/) || [, ''])[1]);
    const how = strip((body.match(/<p class="how">([\s\S]*?)<\/p>/) || [, ''])[1]);
    const css = (body.match(/<style data-code>([\s\S]*?)<\/style>/) || [, ''])[1];
    const jsAll = [...body.matchAll(/<script data-code(?:="[^"]*")?(\s+type="text\/plain")?>([\s\S]*?)<\/script>/g)];
    const js = jsAll.filter(x => !x[1]).map(x => x[2]).join('\n');
    const stage = extractStage(body);
    index.push({ page: f, pageTitle: title, id, title: h2, text: (what + ' ' + how).slice(0, 400) });
    if (stage && js) demos.push({ page: f, pageTitle: title, id, title: h2, what, how, html: dedent(stage), css: dedent(css), js: dedent(js) });
  }
  // デモ以外の見出し（リファレンス・課題・基礎の表）も索引に
  for (const r of body2sections(html)) index.push({ page: f, pageTitle: title, ...r });
}
function dedent(s) { const lines = s.replace(/^\n+|\s+$/g, '').split('\n'); const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length)); return lines.map(l => l.slice(ind)).join('\n'); }
function body2sections(html) {
  const out = [];
  for (const m of html.matchAll(/<div class="(ref|ex)"><h2>([\s\S]*?)<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) out.push({ id: '', title: strip(m[2]), text: strip(m[3]).slice(0, 400) });
  return out;
}
const banner = `// 自動生成（node docs/ui-guide/build.mjs）。手で編集しない。\n`;
fs.writeFileSync(path.join(dir, 'assets', 'demo-data.js'), banner + 'window.DEMOS = ' + JSON.stringify(demos) + ';\n');
fs.writeFileSync(path.join(dir, 'assets', 'search-index.js'), banner + 'window.SEARCH_INDEX = ' + JSON.stringify(index) + ';\n');
console.log(`demo-data.js: ${demos.length} demos / search-index.js: ${index.length} entries`);
