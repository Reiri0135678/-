# QC Board

品質管理室が各部門から紙で受け取っている検査依頼をデジタル化するための業務アプリ。
**ブラウザから多人数で同時に書き込めるホワイトボード**を土台に、後段でスプレッドシート式リスト・画像一覧・kintone 連携を載せていく。

## 構成

```
client/   ブラウザ側 (Vite + React 19 + TypeScript)。tldraw への依存は client/src/canvas/ に閉じ込める
server/   同期サーバー (Node.js + express + ws + @tldraw/sync-core)。ボードごとに 1 ルーム、JSON でファイル保存
shared/   両者で共有する図形スキーマ(検査依頼カード)
scripts/  E2E テスト(2ブラウザで同期を検証)
```

- 同時編集: tldraw sync(WebSocket)。競合解決はライブラリ側
- 認証: `config/users.json` が無ければ名前自己申告のオープンモード。あれば名前+パスワード(役割: admin / member / viewer)。
  viewer はサーバー側で読み取り専用として接続される
- 画像: `PUT /api/uploads/:id` でサーバーに保存し、全員が同じ URL を参照(ログイン必須)
- 依頼一覧: 下部ドロワーのスプレッドシート(セル直接編集・並べ替え・検索・状態フィルタ・CSV 出力)
- 図面の紐付け: 依頼カードから「図面を紐付け」→ ギャラリーかキャンバスの画像をクリック
- kintone: `config/kintone.json` を置くと「kintone へ送信」が有効になる。カードの shape id を外部キーに作成/更新し、
  レコード番号をカードへ書き戻す。`KINTONE_MOCK=1` で接続せずに動作確認できる
- Mission Bridge への埋め込み: `QC_EMBED_KEY` を設定すると、ホストアプリが共有鍵でワンタイムトークンを取得し
  `/embed?token=...&board=<id>` を `WebContentsView` / `<webview>` で開くだけで自動ログインできる。
  カード選択などのイベントは `postMessage` でホストへ通知。実装例は `examples/mission-bridge-host/`
- データ保存先: `data/rooms/<id>.snapshot.json`(環境変数 `QC_DATA_DIR` で変更可)

## 開発

```bash
npm install
npm run dev          # server(3000) と Vite(5173) を同時起動。http://localhost:5173 を開く
npm run typecheck
```

## 本番相当で動かす(社内 LAN のサーバー 1 台)

```bash
npm install
npm run build        # dist/client を生成
PORT=3000 npm start  # 同一ポートで静的配信 + WebSocket
```

他の PC からは `http://<サーバーのIP>:3000/` にアクセスする。
前提: Node.js 22 以上。副作用: `data/` 配下にボード・画像・セッション署名鍵が書き込まれる。

### ユーザー登録(パスワード認証にする場合)

```bash
node scripts/add-user.mjs 山田 <パスワード> admin
node scripts/add-user.mjs 佐藤 <パスワード> member
node scripts/add-user.mjs 見学者 <パスワード> viewer
```

`config/users.json` にハッシュ化して保存される(Git 管理外)。ファイルを削除するとオープンモードに戻る。
社内アカウント(Microsoft 365 等)でのログインは `server/src/auth.ts` を OIDC に差し替えて対応する想定。

### Mission Bridge から埋め込む

```bash
QC_EMBED_KEY=<16文字以上の秘密> PORT=3000 npm start
```

Mission Bridge 側の手順とコードは `examples/mission-bridge-host/README.md`。
注意: ブラウザの `<iframe>` で別サイトに埋め込む形は Cookie の SameSite 制約で動かない(HTTPS + SameSite=None が必要)。
Electron の `WebContentsView` / `<webview>` はトップレベル扱いなので問題ない。

### kintone 連携の設定

`config/kintone.example.json` を `config/kintone.json` にコピーして、サブドメイン・アプリ ID・API トークン・フィールドコードを埋める。
詳細は `config/README.md`。

## E2E テスト(同期の検証)

```bash
npm run build
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

パスワード認証 + kintone モックでサーバーを起動し、2 つのブラウザで同じボードを開いて次を確認する:
同期、サイドバーと一覧セルの編集、検索・フィルタ、CSV、画像アップロードとギャラリー、図面の紐付け、
kintone 送信(新規→更新)とレコード番号の書き戻し、閲覧者の読み取り専用、未ログイン時の 401、永続化。
`SHOT_DIR` を指定すると両画面のスクリーンショットを保存する。

## ライセンスに関する注意

tldraw SDK は本番利用時にライセンスキーが必要。未指定だと右下に透かしが表示され、コンソールに警告が出る。
正式運用前にライセンス条件を確認し、必要なら `Tldraw` の `licenseKey` を設定すること。
