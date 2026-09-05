// ui-kit のビルド（依存なし）: 各モジュールを連結し、file:// でも使える単一ファイル dist/ui-kit.js を作る。
//   node ui-kit/build.mjs
// 生成物は window.UIKit（または CommonJS の module.exports）に全 API を載せる。ES モジュール版はそのまま index.js を import すればよい。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const modules = ['drag', 'camera', 'virtual-list', 'undo', 'hotkeys', 'search', 'offline-queue', 'merge', 'store', 'sync', 'focus-trap', 'position', 'toast', 'sortable', 'split'];
const names = [];
let body = '';
for (const m of modules) {
  let src = fs.readFileSync(path.join(dir, m + '.js'), 'utf8');
  // export function foo / export const foo → 名前を集めて export を外す
  src = src.replace(/^export (function|const|let|class) (\w+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
  if (/^\s*(import|export)\b/m.test(src)) throw new Error(`${m}.js: 未対応の import/export があります`);
  body += `\n// ---- ${m}.js ----\n${src}\n`;
}
const out = `/* ui-kit ${new Date().toISOString().slice(0, 10)} — 自動生成（node ui-kit/build.mjs）。編集は各モジュール側で行う */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.UIKit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
${body}
  return { ${names.join(', ')} };
});
`;
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'ui-kit.js'), out);
console.log(`dist/ui-kit.js: ${modules.length} modules, ${names.length} exports, ${(out.length / 1024).toFixed(1)} KB`);
