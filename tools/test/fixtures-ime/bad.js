// 検出されるべき書き方（意図的に壊してある。実行しない）
const q = document.querySelector('#q');

// ① 変換確定の Enter を「決定」と誤認する
q.addEventListener('keydown', e => {
  if (e.key === 'Enter') submit(q.value);
});

// ② 変換中の input で検索が走る
q.addEventListener('input', e => {
  fetch('/api/search?q=' + e.target.value).then(render);
});

// ③ 直代入でも同じ
q.oninput = function (e) {
  clearTimeout(t); t = setTimeout(() => search(e.target.value), 200);
};

// ④ keyup + Enter
q.addEventListener('keyup', e => { if (e.keyCode === 13) commit(); });

// ⑤ jQuery
$('#name').on('keydown', function (e) { if (e.which === 13) { save(); } });
