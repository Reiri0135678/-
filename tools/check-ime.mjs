#!/usr/bin/env node
// check-ime.mjs — 日本語入力（IME）の変換中イベントを誤処理していないか検査する
//
//   node tools/check-ime.mjs <検査するフォルダ> [--json] [--all]
//   例: node tools/check-ime.mjs ../mission-bridge/src
//       node tools/check-ime.mjs ./customize          # kintone のカスタマイズJS
//
// 依存なし。Node 18 以降。読み取りのみで、ファイルは一切変更しない。
//
// 何を見ているか（教材 X層 107 / docs/ui-guide/18-crossplatform.html#n107）:
//   日本語入力では、変換が確定する前にも input と keydown が飛ぶ。
//   ・変換中の input で検索やAPI呼び出しを走らせる → 無駄な通信・ちらつき
//   ・変換を確定する Enter を「決定」と誤認する     → 入力途中で送信・確定してしまう（実害が大きい）
//   判定は e.isComposing（古い環境向けに e.keyCode === 229 も併記）。
//
// 限界（正直に）:
//   静的な文字列解析なので、ガードを別関数に切り出している場合は検出できず「要確認」に出る。
//   逆に、ハンドラの外で弾いている作りは安全でも指摘される。最終判断は人が行う。
//   意図的に対策しない箇所は、その行か直前行に check-ime-ignore と書けば除外できる。

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const showAll = args.includes('--all');            // 情報レベルも出す
const target = args.find(a => !a.startsWith('--')) ?? '.';

const EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', 'vendor']);

// ---- ファイル収集 ----
function collect(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) collect(p, acc); }
    else if (EXT.has(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

// ---- ハンドラの範囲を切り出す ----
// 登録位置から後方を見て、コールバックの本体（{...} または アロー1式）を粗く取り出す。
// 完全なパーサではないが、「そのハンドラの中に isComposing があるか」を見るには足りる。
function handlerBody(src, from) {
  const open = src.indexOf('{', from);
  const nl = src.indexOf('\n', from);
  // 波括弧が無い（1行アロー）ときは、その行を本体とみなす
  if (open < 0 || (nl >= 0 && open > nl && !/=>\s*$/.test(src.slice(from, nl)))) {
    return src.slice(from, nl < 0 ? src.length : nl);
  }
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(from, i + 1); }
  }
  return src.slice(from, Math.min(src.length, from + 2000));   // 閉じていない＝広めに見る
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const HAS_GUARD = /isComposing|keyCode\s*===?\s*229|which\s*===?\s*229|compositionend|compositionstart/;
const ENTER = /(['"`])Enter\1|keyCode\s*===?\s*13|which\s*===?\s*13|\.key\s*===?\s*['"`]Enter/;
// input ハンドラの中で「重い/副作用のある処理」をしていそうな手がかり
const SIDE_EFFECT = /fetch\s*\(|axios|XMLHttpRequest|kintone\.api|\bsearch\b|\bfilter\b|\bquery\b|debounce|setTimeout|\.value\s*=|render|update|reload/i;

// 登録の書き方いろいろ（DOM / React / Vue / Svelte / 直代入）
const REGISTRATIONS = [
  { re: /addEventListener\s*\(\s*['"`](keydown|keypress|keyup|input|beforeinput)['"`]/g, ev: m => m[1] },
  { re: /\.on(keydown|keypress|keyup|input)\s*=/gi,                                      ev: m => m[1].toLowerCase() },
  { re: /\bon(KeyDown|KeyPress|KeyUp|Input|Change)\s*=\s*\{/g,                           ev: m => m[1].toLowerCase().replace('change', 'input') },
  { re: /(?:v-on:|@)(keydown|keypress|keyup|input)\b/g,                                   ev: m => m[1] },
  { re: /\bon:(keydown|keypress|keyup|input)\b/g,                                         ev: m => m[1] },
  { re: /\$\(\s*[^)]*\)\s*\.\s*(?:on|bind)\s*\(\s*['"`](keydown|keypress|keyup|input)['"`]/g, ev: m => m[1] },
];

const findings = [];
const files = fs.statSync(target).isDirectory() ? collect(target) : [target];

for (const file of files) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const seen = new Set();

  for (const { re, ev } of REGISTRATIONS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const event = ev(m);
      const body = handlerBody(src, m.index);
      const line = lineOf(src, m.index);
      const key = `${line}:${event}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 意図的に対策しない箇所（教材の悪い例など）は、その行か直前行に check-ime-ignore と書けば除外できる
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const prevStart = src.lastIndexOf('\n', lineStart - 2) + 1;
      if (/check-ime-ignore/.test(src.slice(prevStart, src.indexOf('\n', m.index)))) continue;

      const guarded = HAS_GUARD.test(body);
      const handlesEnter = ENTER.test(body);
      const sideEffect = SIDE_EFFECT.test(body);
      const snippet = src.slice(m.index, m.index + 90).split('\n')[0].trim();

      if (guarded) {
        if (showAll) findings.push({ file, line, event, level: 'ok', snippet, why: '変換中を判定している' });
        continue;
      }
      if ((event === 'keydown' || event === 'keypress') && handlesEnter) {
        findings.push({ file, line, event, level: 'high', snippet,
          why: '変換を確定する Enter を「決定」として処理してしまう（入力途中で送信・確定される）',
          fix: "ハンドラ先頭に if (e.isComposing || e.keyCode === 229) return;" });
      } else if (event === 'keyup' && handlesEnter) {
        findings.push({ file, line, event, level: 'medium', snippet,
          why: 'keyup は確定後に来るため誤爆は少ないが、環境によっては確定の Enter を拾う',
          fix: 'keydown + isComposing 判定に寄せるのが確実' });
      } else if ((event === 'input' || event === 'beforeinput') && sideEffect) {
        findings.push({ file, line, event, level: 'high', snippet,
          why: '変換の途中（未確定の文字）で検索・通信・再描画が走る',
          fix: "if (e.isComposing) return; を入れ、compositionend でもう一度呼ぶ" });
      } else if (event === 'input' || event === 'keydown') {
        findings.push({ file, line, event, level: 'low', snippet,
          why: '変換中にも発火する。中で何をしているか確認',
          fix: '副作用があるなら isComposing で弾く' });
      }
    }
  }
}

// ---- 出力 ----
const RANK = { high: 0, medium: 1, low: 2, ok: 3 };
findings.sort((a, b) => RANK[a.level] - RANK[b.level] || a.file.localeCompare(b.file) || a.line - b.line);

if (asJson) {
  console.log(JSON.stringify({ target, files: files.length, findings }, null, 2));
} else {
  const LABEL = { high: '要修正', medium: '要確認', low: '目視', ok: '対策済' };
  const n = l => findings.filter(f => f.level === l).length;
  console.log(`検査対象: ${target}（${files.length} ファイル）\n`);
  if (!findings.length) console.log('指摘なし。');
  for (const f of findings) {
    // file:line 形式にしておくと、そのままエディタで開ける
    console.log(`[${LABEL[f.level]}] ${f.file}:${f.line}  (${f.event}) ${f.why}`);
    console.log(`    ${f.snippet}`);
    if (f.fix) console.log(`    → ${f.fix}\n`);
  }
  console.log(`\n要修正 ${n('high')} / 要確認 ${n('medium')} / 目視 ${n('low')}` + (showAll ? ` / 対策済 ${n('ok')}` : ''));
  console.log('※ ガードを別関数に切り出している場合は検出できない。最終判断は目視で。');
}
process.exitCode = findings.some(f => f.level === 'high') ? 1 : 0;
