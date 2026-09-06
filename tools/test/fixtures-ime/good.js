// 対策済みの書き方
const q = document.querySelector('#q');

q.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;   // 変換中は無視
  if (e.key === 'Enter') submit(q.value);
});

q.addEventListener('input', e => {
  if (e.isComposing) return;
  fetch('/api/search?q=' + e.target.value).then(render);
});
q.addEventListener('compositionend', e => {
  fetch('/api/search?q=' + e.target.value).then(render);   // 確定時に1回だけ
});
