// 教材のビルド（依存なし）: node docs/ui-guide/build.mjs
//  - assets/demo-data.js       : 各デモの HTML / CSS / JS を抽出（14-playground.html が使う）
//  - assets/search-index.js    : 全ページの見出し・説明の索引（00-index.html の横断検索が使う）
//  - assets/manifest.js        : 単一ファイル版に収録するファイル一覧（16-bundler.html が使う）
//  - dist/ui-guide-standalone.html : 単一ファイル版（assets/bundler.js と同じ処理。ブラウザだけでも 16-bundler.html から作れる）
// デモページを編集したら再実行する（verify.mjs が古さを検知する）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// <div class="stage ...> から対応する </div> までを div の入れ子を数えて切り出す
// 直後に並ぶ兄弟の <div class="row"> は操作ボタン群なので一緒に取り込む
// （取り込まないと、プレイグラウンドでボタンが無いまま JS が動いて null 参照になる）
function matchDiv(html, start) {
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let depth = 0, m;
  while ((m = re.exec(html))) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) return m.index + 6; }
  return -1;
}
function extractStage(html) {
  const start = html.search(/<div class="stage[^"]*"/); if (start < 0) return '';
  let end = matchDiv(html, start); if (end < 0) return '';
  for (;;) {
    const rest = html.slice(end);
    const m = rest.match(/^(\s*)<div class="row"/); if (!m) break;
    const next = matchDiv(html, end + m[1].length); if (next < 0) break;
    end = next;
  }
  return html.slice(start, end);
}
const pages = fs.readdirSync(dir).filter(f => /^\d\d-.*\.html$/.test(f)).sort();
const demos = [], index = [], skipped = [];
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
    if (js && !stage) skipped.push(`${f}#${id}`);   // スクリプトはあるのに stage を取り出せない＝マークアップが閉じていない
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

// ---- 単一ファイル版 ----
// 収録対象（リポジトリ相対のキー）。ブラウザ版（16-bundler.html）もこの一覧を読んで同じものを集める。
const root = path.resolve(dir, '..', '..');
const rel = p => path.relative(root, p).split(path.sep).join('/');
const listDir = (d, re) => fs.existsSync(d) ? fs.readdirSync(d).filter(f => re.test(f)).map(f => rel(path.join(d, f))) : [];
const manifest = [
  ...listDir(root, /\.md$/),                       // TUTORIAL / README / CHANGELOG / DEVELOPMENT-LOG（教材からリンクしている）
  ...listDir(dir, /\.(html|md)$/),
  ...listDir(path.join(dir, 'assets'), /\.(js|css)$/),
  ...listDir(path.join(root, 'ui-kit'), /\.(js|md|ts)$/),
  ...listDir(path.join(root, 'ui-kit', 'dist'), /\.js$/),
  ...listDir(path.join(root, 'ui-kit', 'example'), /\.html$/),
].sort().filter(k => k !== 'docs/ui-guide/assets/manifest.js');   // 自分自身は入れない（毎回中身が変わるため）
fs.writeFileSync(path.join(dir, 'assets', 'manifest.js'), banner + 'window.UI_GUIDE_MANIFEST = ' + JSON.stringify(manifest, null, 0) + ';\n');

const files = {};
for (const key of manifest) files[key] = fs.readFileSync(path.join(root, key), 'utf8');
new Function(fs.readFileSync(path.join(dir, 'assets', 'bundler.js'), 'utf8'))();   // globalThis.UIGuideBundler を定義
// 生成日は入力の最終更新日から決める（同じ入力なら同じ出力になり、verify.mjs の鮮度チェックが安定する）
const newest = Math.max(...manifest.map(k => fs.statSync(path.join(root, k)).mtimeMs));
const html = globalThis.UIGuideBundler.buildStandalone(files, { date: new Date(newest).toISOString().slice(0, 10) });
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'ui-guide-standalone.html'), html);

if (skipped.length) { console.error('警告: デモを抽出できませんでした（div が閉じていない可能性）: ' + skipped.join(', ')); process.exitCode = 1; }
console.log(`demo-data.js: ${demos.length} demos / search-index.js: ${index.length} entries`);
console.log(`manifest.js: ${manifest.length} files / dist/ui-guide-standalone.html: ${(Buffer.byteLength(html, 'utf8') / 1024 / 1024).toFixed(2)} MB`);   // 文字数ではなく UTF-8 バイト数（日本語は1文字3バイト。16-bundler.html の Blob.size と一致する）
