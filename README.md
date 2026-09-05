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
- ユーザー識別: 名前の自己申告(localStorage 保持)。カーソルに名前が出る
- 画像: `PUT /api/uploads/:id` でサーバーに保存し、全員が同じ URL を参照
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
前提: Node.js 22 以上。副作用: `data/` 配下にボードと画像が書き込まれる。

## E2E テスト(同期の検証)

```bash
npm run build
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

2 つのブラウザで同じボードを開き、A が置いた依頼カードが B に、B が置いた付箋が A に届くこと、
相手の存在が見えること、切断後にスナップショットが保存されることを確認する。
`SHOT_DIR` を指定すると両画面のスクリーンショットを保存する。

## ライセンスに関する注意

tldraw SDK は本番利用時にライセンスキーが必要。未指定だと右下に透かしが表示され、コンソールに警告が出る。
正式運用前にライセンス条件を確認し、必要なら `Tldraw` の `licenseKey` を設定すること。
