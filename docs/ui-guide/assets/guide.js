// 共通ランタイム：目次生成と「動いているコードそのもの」の表示
// 各デモは <section class="demo" id="nXX"> の中に <style data-code> / <script data-code> を持つ。
// ここでは、それらの textContent を <details> に転記する（表示コード＝実行コード）。
// 共通ヘルパ（各デモから使う。<head> で読み込む前提）
window.$ = (sel, root = document) => root.querySelector(sel);
window.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
window.logTo = (el, msg) => {
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
};

// テーマ（枠のみ。デモ領域 .stage は配色固定）: localStorage 'ui-guide.theme' = 'light' | 'dark' | ''(OS設定)
const THEME_KEY = 'ui-guide.theme';
const applyTheme = () => { let t = ''; try { t = localStorage.getItem(THEME_KEY) || ''; } catch {} document.documentElement.dataset.theme = t; };
applyTheme();

document.addEventListener('DOMContentLoaded', function () {
  // ヘッダーにテーマ切替を差し込む
  const top = document.querySelector('header.top');
  if (top) {
    const b = document.createElement('button'); b.className = 'theme-toggle'; b.type = 'button'; b.title = 'テーマ: OS設定 → ダーク → ライト';
    const label = () => { const t = document.documentElement.dataset.theme; b.textContent = t === 'dark' ? '🌙 ダーク' : t === 'light' ? '☀ ライト' : '🖥 OS設定'; };
    b.onclick = () => { const cur = document.documentElement.dataset.theme; const next = cur === '' ? 'dark' : cur === 'dark' ? 'light' : ''; try { next ? localStorage.setItem(THEME_KEY, next) : localStorage.removeItem(THEME_KEY); } catch {} applyTheme(); label(); };
    label(); top.appendChild(b);
  }
  const sections = [...document.querySelectorAll('section.demo')];

  // 目次
  const toc = document.querySelector('aside.toc');
  if (toc) {
    sections.forEach(sec => {
      const a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = sec.querySelector('h2').textContent.replace(/\s+/g, ' ').trim();
      toc.appendChild(a);
    });
    const links = [...toc.querySelectorAll('a')];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l => l.classList.toggle('current', l.hash === '#' + e.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => io.observe(s));
  }

  // コード表示
  const dedent = s => {
    const lines = s.replace(/^\n+|\s+$/g, '').split('\n');
    const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
    return lines.map(l => l.slice(indent)).join('\n');
  };
  sections.forEach(sec => {
    const codes = [...sec.querySelectorAll('[data-code]')];
    if (!codes.length) return;
    const det = document.createElement('details');
    det.className = 'code';
    det.innerHTML = '<summary>コードを見る（このデモを動かしている実物）</summary>';
    if (sec.querySelector('script[data-code]:not([type])')) {
      const a = document.createElement('a'); a.className = 'pg-link'; a.href = '14-playground.html#' + sec.id; a.textContent = '▶ プレイグラウンドで編集して試す';
      det.appendChild(a);
    }
    codes.forEach(el => {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = el.dataset.code || (el.tagName === 'STYLE' ? 'CSS' : (el.tagName === 'TEMPLATE' ? 'HTML' : 'JavaScript')); // data-code="任意ラベル" で上書き可
      const pre = document.createElement('pre');
      pre.textContent = dedent(el.tagName === 'TEMPLATE' ? el.innerHTML : el.textContent);
      det.appendChild(label);
      det.appendChild(pre);
    });
    sec.appendChild(det);
  });
});
