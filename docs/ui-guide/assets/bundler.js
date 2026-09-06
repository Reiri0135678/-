/* bundler.js — 資料一式を「単一 HTML ファイル」にまとめる（バニラJS・依存なし）
 *
 * ブラウザ（16-bundler.html）と Node（build.mjs）の両方から同じ関数を使う。
 *   UIGuideBundler.buildStandalone(files, { date }) -> HTML 文字列
 *   files: { "docs/ui-guide/00-index.html": "…", "ui-kit/drag.js": "…", … }（リポジトリ相対のキー）
 *
 * 生成物は外部ファイルを一切参照しない。ダブルクリックで開けて、そのまま配布できる。
 */
(function (global) {
  'use strict';
  var GUIDE = 'docs/ui-guide/';
  var SHELL_KEY = GUIDE + 'assets/standalone-shell.js';
  // 生成にだけ使うもの（配布物には入れない）
  var EXCLUDE = [SHELL_KEY, GUIDE + 'assets/bundler.js', GUIDE + 'assets/manifest.js', GUIDE + '16-bundler.html'];

  // <script> の中に置いても壊れないよう、危険な並びだけ \u003c に逃がす
  function jsonForScript(value) {
    return JSON.stringify(value).replace(/<\//g, '\\u003c/').replace(/<!--/g, '\\u003c!--').replace(/<script/gi, '\\u003cscript');
  }
  function titleOf(html, fallback) {
    var m = html.match(/<title>([\s\S]*?)<\/title>/);
    return m ? m[1].trim() : fallback;
  }

  var SHELL_CSS = [
    ':root{color-scheme:light dark}',
    '*{box-sizing:border-box}',
    'html,body{height:100%}',
    'body{margin:0;display:flex;flex-direction:column;font:13px system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif;background:#0f1419;color:#e6e9ee}',
    '#ug-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 12px;background:#171d26;border-bottom:1px solid #2a3441}',
    '#ug-bar b{font-size:13px;white-space:nowrap}',
    '#ug-nav{display:flex;flex-wrap:wrap;gap:2px;flex:1 1 420px;min-width:0}',
    '#ug-nav a{color:#c7d2e0;text-decoration:none;font-size:12px;padding:3px 8px;border-radius:999px;white-space:nowrap}',
    '#ug-nav a:hover{background:#243044}',
    '#ug-nav a.on{background:#2563eb;color:#fff}',
    '#ug-more{font:inherit;font-size:12px;background:#0f1419;color:#c7d2e0;border:1px solid #2a3441;border-radius:6px;padding:3px 6px;max-width:230px}',
    '#ug-path{font:11px ui-monospace,Menlo,Consolas,monospace;color:#8ea0b5}',
    '#ug-gen{font-size:11px;color:#8ea0b5;margin-left:auto;white-space:nowrap}',
    '#ug-frame{flex:1;width:100%;border:0;background:#fff}'
  ].join('\n');

  function buildStandalone(files, opts) {
    opts = opts || {};
    var shell = files[SHELL_KEY];
    if (!shell) throw new Error(SHELL_KEY + ' が見つかりません（生成に必要です）');
    // script 要素にそのまま埋める文字列なので、終端を壊す並びが無いことを必ず確かめる
    // （\x3c!-- と \x3cscript が混ざると HTML パーサが二重エスケープ状態に入り、\x3c/script> で閉じられなくなる）
    var danger = shell.match(/\x3c\/script|\x3c!--|\x3cscript/i);
    if (danger) throw new Error(SHELL_KEY + ' に script を壊す並び「' + danger[0] + '」があります（\\x3c で書いてください）');

    var payload = { files: {}, pages: [], generated: opts.date || new Date().toISOString().slice(0, 10) };
    Object.keys(files).sort().forEach(function (k) {
      if (EXCLUDE.indexOf(k) >= 0) return;
      payload.files[k] = files[k];
    });
    payload.pages = Object.keys(payload.files)
      .filter(function (k) { return /^docs\/ui-guide\/\d\d-[^/]*\.html$/.test(k); }).sort()
      .map(function (k) { return { key: k, title: titleOf(payload.files[k], k) }; });
    if (!payload.pages.length) throw new Error('ページが 1 つも見つかりません');

    return [
      '<!DOCTYPE html>',
      '<html lang="ja">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + (opts.title || 'UI操作レクチャー資料（単一ファイル版）') + '</title>',
      '<style>' + SHELL_CSS + '</style>',
      '</head>',
      '<body>',
      '<header id="ug-bar"><b>UI操作レクチャー資料</b><nav id="ug-nav"></nav><select id="ug-more"></select><span id="ug-path"></span><span id="ug-gen"></span></header>',
      '<iframe id="ug-frame" title="資料の表示領域"></iframe>',
      '<script>window.__BUNDLE = ' + jsonForScript(payload) + ';<\/script>',
      '<script>' + shell + '<\/script>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  global.UIGuideBundler = { buildStandalone: buildStandalone, EXCLUDE: EXCLUDE, GUIDE: GUIDE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
