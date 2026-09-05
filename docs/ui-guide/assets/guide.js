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

document.addEventListener('DOMContentLoaded', function () {
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
    codes.forEach(el => {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = el.tagName === 'STYLE' ? 'CSS' : (el.tagName === 'TEMPLATE' ? 'HTML' : 'JavaScript');
      const pre = document.createElement('pre');
      pre.textContent = dedent(el.tagName === 'TEMPLATE' ? el.innerHTML : el.textContent);
      det.appendChild(label);
      det.appendChild(pre);
    });
    sec.appendChild(det);
  });
});
