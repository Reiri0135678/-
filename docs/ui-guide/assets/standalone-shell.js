/* standalone-shell.js — 単一ファイル版のランタイム（バニラJS・依存なし）
 *
 * 生成された 1 枚の HTML に、この中身がそのまま埋め込まれる。
 * window.__BUNDLE = { files: { "docs/ui-guide/02-basic.html": "…" }, pages: [{key,title}], generated: "YYYY-MM-DD" }
 *
 * 仕組み：各ページを「完全な HTML 文書」に組み立てて iframe の srcdoc に入れる。
 *   - スタイルとスクリプトが元ファイルと同じ順序で動くので、デモはそのまま動く
 *   - 文書がページごとに分かれるので、ページ間で CSS が衝突しない
 *   - リンクは iframe 内で横取りして親に伝え、親が該当ページへ切り替える
 *
 * 注意：このファイルの中身は script 要素の中にそのまま埋め込まれる。
 * タグに見える並び（\x3cscript、\x3c/…、\x3c!--）は必ず \x3c で書く。
 * 生の文字で書くと HTML パーサが script 要素の終端を見失い、丸ごと動かなくなる。
 */
(function () {
  'use strict';
  var B = window.__BUNDLE, FILES = B.files, PAGES = B.pages;
  var GUIDE = 'docs/ui-guide/';
  var ASSETS = { css: FILES[GUIDE + 'assets/guide.css'] || '', js: FILES[GUIDE + 'assets/guide.js'] || '' };

  function jsonForScript(value) {
    return JSON.stringify(value).replace(/\x3c\//g, '\\u003c/').replace(/\x3c!--/g, '\\u003c!--').replace(/\x3cscript/gi, '\\u003cscript');
  }

  // ---- パス解決（"03-custom.html" や "../../ui-kit/x.js" を FILES のキーに直す） ----
  function resolve(fromKey, href) {
    var dir = fromKey.split('/').slice(0, -1);
    href.split('/').forEach(function (p) {
      if (p === '' || p === '.') return;
      if (p === '..') dir.pop(); else dir.push(p);
    });
    return dir.join('/');
  }

  // プレイグラウンドとクイズが内側の iframe 用に組み立てる文字列（相対パスのままでは解決できない）
  var SRCDOC_REF = '\x3clink rel="stylesheet" href="assets/guide.css">\x3cscript src="assets/guide.js">\x3c\\/script>';
  // 差し込み先はページ側 JS のテンプレート文字列の中なので、閉じタグは \\/ でエスケープしたまま渡す
  // （生の \x3c/script> を入れると、ページ自身の script 要素がそこで終わってしまう）
  var SRCDOC_INLINE = '\x3cstyle>${__A.css}\x3c/style>\x3cscript>${__A.js}\x3c\\/script>';
  var RE_LINK = /\x3clink rel="stylesheet" href="([^"]+)">/g;
  var RE_SCRIPT = /\x3cscript src="([^"]+)">\x3c\/script>/g;

  function compose(key, anchor) {
    var src = FILES[key];
    if (src == null) return textDoc(key, '（このファイルは単一ファイル版に含まれていません）');
    if (!/\.html$/.test(key)) return textDoc(key, src);

    var html = src.split(SRCDOC_REF).join(SRCDOC_INLINE);
    html = html.replace(RE_LINK, function (m, href) {
      var t = FILES[resolve(key, href)];
      return t == null ? m : '\x3cstyle>' + t + '\x3c/style>';
    });
    html = html.replace(RE_SCRIPT, function (m, src2) {
      var t = FILES[resolve(key, src2)];
      return t == null ? m : '\x3cscript>' + t + '\x3c/script>';
    });
    // 単一ファイル版でのふるまいを合わせる小さな差し替え（プレイグラウンド）
    html = html.replace("load((location.hash || '#n02').slice(1));", "load((window.__ANCHOR ? '#' + window.__ANCHOR : '#n02').slice(1));");
    html = html.replace("history.replaceState(null, '', '#' + current.id);", "try { history.replaceState(null, '', '#' + current.id); } catch (e) {}");
    // 先頭に共通アセットとアンカー、末尾にリンク横取りを差し込む
    var head = '\x3cscript>window.__A = ' + jsonForScript(ASSETS) + '; window.__ANCHOR = ' + jsonForScript(anchor || '') + ';\x3c/script>';
    html = html.replace('\x3cmeta charset="utf-8">', '\x3cmeta charset="utf-8">' + head);
    var endBody = html.lastIndexOf('\x3c/body>');
    if (endBody >= 0) html = html.slice(0, endBody) + '\x3cscript>' + INTERCEPT + '\x3c/script>' + html.slice(endBody);
    return html;
  }

  // .md / .js などはそのまま読めるように整形して見せる
  function textDoc(key, text) {
    return '\x3c!DOCTYPE html>\x3chtml lang="ja">\x3chead>\x3cmeta charset="utf-8">\x3cstyle>' + ASSETS.css + '\x3c/style>' +
      '\x3cstyle>body{padding:16px}h2{font-size:14px;margin:0 0 8px;color:var(--muted)}' +
      'pre{white-space:pre-wrap;word-break:break-word;font:12.5px/1.6 ui-monospace,Menlo,Consolas,monospace;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;margin:0}\x3c/style>' +
      '\x3c/head>\x3cbody>\x3ch2>' + key + '\x3c/h2>\x3cpre id="t">\x3c/pre>' +
      '\x3cscript>document.getElementById("t").textContent = ' + jsonForScript(text) + ';\x3c/script>\x3c/body>\x3c/html>';
  }

  // iframe 内で動く：相対リンクを親へ渡す ＋ アンカーへスクロール
  var INTERCEPT = [
    'document.addEventListener("click", function (e) {',
    '  var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;',
    '  var href = a.getAttribute("href");',
    '  if (!href || /^(https?:|mailto:|javascript:)/i.test(href) || href.charAt(0) === "#") return;',
    '  e.preventDefault(); parent.postMessage({ uiGuideNav: href }, "*");',
    '});',
    'if (window.__ANCHOR) window.addEventListener("load", function () {',
    '  setTimeout(function () { var el = document.getElementById(window.__ANCHOR); if (el) el.scrollIntoView(); }, 60);',
    '});'
  ].join('\n');

  // ---- 親側（シェル） ----
  var frame = document.getElementById('ug-frame');
  var nav = document.getElementById('ug-nav');
  var more = document.getElementById('ug-more');
  var current = GUIDE + '00-index.html';

  function show(key, anchor) {
    current = key;
    frame.srcdoc = compose(key, anchor);
    [].forEach.call(nav.querySelectorAll('a'), function (a) { a.classList.toggle('on', a.getAttribute('data-key') === key); });
    more.value = PAGES.some(function (p) { return p.key === key; }) ? '' : key;
    var hash = '#' + key + (anchor ? '@' + anchor : '');
    try { history.replaceState(null, '', hash); } catch (e) { location.hash = hash; }
    document.getElementById('ug-path').textContent = key.replace(GUIDE, '') + (anchor ? ' #' + anchor : '');
  }

  window.addEventListener('message', function (e) {
    var href = e.data && e.data.uiGuideNav;
    if (!href) return;
    var parts = href.split('#'), key = resolve(current, parts[0]);
    if (FILES[key] == null) { alert('単一ファイル版に含まれていないファイルです：' + key); return; }
    show(key, parts[1] || '');
  });

  // ナビの見出しは短く：「第N弾」と括弧書きを落とし、「見出し：説明」は見出しだけにする
  function navLabel(title) {
    var t = title.replace(/^第\d+弾\s*/, '').replace(/[（(].*$/, '').trim();
    var head = t.split('：')[0];
    return head.length >= 3 ? head : t;
  }
  nav.innerHTML = PAGES.map(function (p) {
    return '\x3ca href="#" data-key="' + p.key + '" title="' + p.title + '">' + navLabel(p.title) + '\x3c/a>';
  }).join('');
  nav.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-key]');
    if (!a) return;
    e.preventDefault();
    show(a.getAttribute('data-key'), '');
  });

  var others = Object.keys(FILES).filter(function (k) { return !PAGES.some(function (p) { return p.key === k; }); }).sort();
  more.innerHTML = '\x3coption value="">その他のファイル…\x3c/option>' + others.map(function (k) {
    return '\x3coption value="' + k + '">' + k + '\x3c/option>';
  }).join('');
  more.addEventListener('change', function () { if (more.value) show(more.value, ''); });

  document.getElementById('ug-gen').textContent = '生成 ' + (B.generated || '') + ' ／ ' + Object.keys(FILES).length + ' ファイル';

  // ハッシュ（#キー@アンカー）でページを決める。起動時と、戻る/進む・手打ちの変更に対応する。
  function fromHash() {
    var h = decodeURIComponent((location.hash || '').slice(1));
    var at = h.lastIndexOf('@');
    return { key: at > 0 ? h.slice(0, at) : h, anchor: at > 0 ? h.slice(at + 1) : '' };
  }
  window.addEventListener('hashchange', function () {
    var t = fromHash();
    if (FILES[t.key] && (t.key !== current || t.anchor)) show(t.key, t.anchor);
  });
  var start = fromHash();
  show(FILES[start.key] ? start.key : GUIDE + '00-index.html', start.anchor);
})();
