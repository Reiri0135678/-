// check-ime.mjs の自己テスト: node tools/test/check-ime.test.mjs
// 「壊れた書き方は必ず拾う」「対策済みの書き方は指摘しない」を固定する。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(dir, '..', 'check-ime.mjs');
const run = target => {
  try { return JSON.parse(execFileSync(process.execPath, [script, target, '--json'], { encoding: 'utf8' })); }
  catch (e) { return JSON.parse(e.stdout); }        // high があると終了コード 1 になる
};

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, cond, detail });
const at = (f, line, level) => f.findings.some(x => x.file.endsWith(line[0]) && x.line === line[1] && x.level === level);

const bad = run(path.join(dir, 'fixtures-ime'));
ok('keydown + Enter を要修正として拾う',        at(bad, ['bad.js', 5], 'high'));
ok('input + 通信 を要修正として拾う',            at(bad, ['bad.js', 10], 'high'));
ok('oninput 直代入 も拾う',                      at(bad, ['bad.js', 15], 'high'));
ok('keyup + Enter は要確認として拾う',           at(bad, ['bad.js', 20], 'medium'));
ok('jQuery の .on(keydown) も拾う',              at(bad, ['bad.js', 23], 'high'));
ok('JSX の onKeyDown も拾う',                    at(bad, ['bad.jsx', 2], 'high'));
ok('対策済みのファイルは指摘しない',              !bad.findings.some(f => f.file.endsWith('good.js')),
   JSON.stringify(bad.findings.filter(f => f.file.endsWith('good.js'))));

// 教材本体（IME 対策済み）に要修正が残っていないこと
const guide = run(path.join(dir, '..', '..', 'docs', 'ui-guide'));
ok('教材ページに要修正の残りが無い', !guide.findings.some(f => f.level === 'high'),
   guide.findings.filter(f => f.level === 'high').map(f => `${f.file}:${f.line}`).join(', '));
const kit = run(path.join(dir, '..', '..', 'ui-kit'));
ok('ui-kit に要修正の残りが無い', !kit.findings.some(f => f.level === 'high'),
   kit.findings.filter(f => f.level === 'high').map(f => `${f.file}:${f.line}`).join(', '));

let failed = 0;
for (const r of results) { console.log(`${r.cond ? '✔' : '✖'} ${r.name}${r.cond ? '' : ' — ' + r.detail}`); if (!r.cond) failed++; }
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
