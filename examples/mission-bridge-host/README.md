# Mission Bridge への埋め込み例

QC Board を Mission Bridge(Electron)のウィンドウ内に表示し、Mission Bridge のログインユーザーで
自動ログインさせる最小例。`main.js` と `preload.js` を Mission Bridge の該当箇所に移植する。

## 流れ

1. QC Board サーバーを `QC_EMBED_KEY=<16文字以上の秘密>` を付けて起動
2. Mission Bridge のメインプロセスが `POST /api/auth/embed { key, name, role }` でトークンを取得(60 秒有効・1 回限り)
3. `WebContentsView`(または `<webview>`)で `http://<server>/embed?token=...&board=<ボードID>` を読み込む
4. QC Board がトークンをセッション Cookie に交換し、ボードを表示する
5. QC Board 内のイベント(`ready` / `board-opened` / `card-selected` / `error`)は `window.postMessage` で飛ぶので、
   preload で `ipcRenderer` に中継して受け取る

## `<webview>` を使う場合

レンダラー側で `webviewTag: true` を有効にし、次のように置く。

```html
<webview id="qc" src="about:blank" preload="./preload.js" style="width:100%;height:100%"></webview>
<script>
  // メインプロセスで取得したトークンを IPC で受け取ってから
  document.getElementById('qc').src = `${QC_BOARD_URL}/embed?token=${token}&board=${boardId}`
  document.getElementById('qc').addEventListener('ipc-message', (e) => console.log(e.channel, e.args))
</script>
```

## 注意

- 共有鍵はメインプロセスだけが持つ。レンダラーや設定画面に出さない
- 役割(`admin` / `member` / `viewer`)は Mission Bridge 側で決めて渡す。QC Board 側の users.json は不要
- 埋め込み中は QC Board のヘッダーが縮み、ログアウトボタンが消える
- ボード ID は `GET /api/rooms`(要ログイン)で取得できる。ボード名ではなく `id` を渡す
