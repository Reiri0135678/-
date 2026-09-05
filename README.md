# QC Board

品質管理室が各部門から紙で受け取っている検査依頼をデジタル化するための業務アプリ。
**ブラウザから多人数で同時に書き込めるホワイトボード**を土台に、後段でスプレッドシート式リスト・画像一覧・kintone 連携を載せていく。

## 構成

```
client/   ブラウザ側 (Vite + React 19 + TypeScript)。キャンバスは自作(Konva で描画、Yjs で同期)。client/src/canvas/ に閉じ込める
server/   同期サーバー (Node.js + express + ws + Yjs)。ボードごとに 1 ルーム、Yjs のバイナリ更新をファイル保存
shared/   両者で共有する図形定義(ペン・文字・付箋・矢印・図形・画像・検査依頼カード)
scripts/  E2E テスト(2ブラウザで同期を検証)
```

- 同時編集: Yjs(CRDT)+ y-websocket 互換の自前サーバー。競合解決は Yjs、取り消しは自分の変更のみ対象
- キャンバス: 自作。選択・移動・拡縮・回転、ペン(perfect-freehand)、蛍光、消しゴム、文字、付箋、矢印、四角、楕円、画像、依頼カード、
  範囲選択、複製、ズーム・パン、他の人のカーソル表示。**使用ライブラリはすべて MIT(Konva / react-konva / Yjs / perfect-freehand)で、ライセンス費用・透かし・キーは無い**
- 認証: `config/users.json` が無ければ名前自己申告のオープンモード。あれば名前+パスワード(役割: admin / member / viewer)。
  viewer はサーバー側で読み取り専用として接続される
- 画像: `PUT /api/uploads/:id` でサーバーに保存し、全員が同じ URL を参照(ログイン必須)
- 受付番号: 依頼カードにサーバーが `QC-YYYY-NNNN` を自動採番(年ごとの連番、作成経路を問わない)
- 依頼フォーム: `/form/<ボードID>` で依頼者がボードを開かずに依頼を出せる(品番・ロット・数量・部門・件名・希望納期・優先度・備考・図面添付)。
  送信するとボードにカードと図面が置かれ、受付番号が表示される。スマホ・タブレット対応
- 状態: 未受付 / 受付 / 検査中 / 保留 / 差戻し / 完了 / 取消。優先度: 通常 / 至急(カードに赤帯)
- 取消: 依頼カードは物理削除せず「取消」状態にする(Delete キーも同じ)。記録として残る
- アーカイブ: 完了・取消のカードを一覧の「アーカイブ」でボードから外す。一覧(チェックで表示)と kintone には残る
- 変更履歴: 誰がいつ何を変えたかをサーバーが `data/rooms/<id>.log.jsonl` に追記(5MB で 5 世代ローテーション)。カード編集画面の「変更履歴」と `GET /api/rooms/:id/history` で参照
- 検査結果: 合格 / 条件付合格 / 不合格 を記録。判定者・判定日は自動記録。所見(測定値)欄あり
- 状態遷移ルール: 現在の状態から移れる状態だけが選べる。ルールは `shared/shapes.ts` の `STATUS_TRANSITIONS` 1 箇所で変更
- 通知: `config/notify.json`(または `QC_NOTIFY_WEBHOOK`)を設定すると、新規依頼・状態変更・検査結果・担当割当を Teams / Slack / 汎用 JSON の Webhook へ送る
- バックアップ: `QC_BACKUP_DIR` を設定すると起動 5 秒後と `QC_BACKUP_INTERVAL_HOURS`(既定 24)ごとに `data/` をコピー(`QC_BACKUP_KEEP` 世代保持)。手動は `npm run backup`、管理者 API `POST /api/admin/backup`
- 自動アーカイブ: `QC_AUTO_ARCHIVE_DAYS=N` で完了・取消のまま N 日経ったカードを毎時アーカイブ。手動は `POST /api/admin/archive {days}`
- PDF 図面: ドロップ・貼り付け・依頼フォーム添付で PDF をページごとに画像化して取り込む(ブラウザ側で変換、最大 10 ページ)
- タブレット: 900px 以下でサイドバーを折りたたみ(☰)、2 本指でピンチズーム
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
npm run backup       # data/ を backups/<日時>/ にコピー(14 世代保持)
```

### 環境変数一覧

| 変数 | 既定 | 意味 |
|---|---|---|
| `PORT` | 3000 | 待ち受けポート |
| `QC_DATA_DIR` | data | ボード・画像・履歴・採番カウンタの保存先 |
| `QC_USERS_FILE` | config/users.json | ユーザー定義(無ければオープンモード) |
| `QC_KINTONE_CONFIG` | config/kintone.json | kintone 連携設定 |
| `KINTONE_MOCK` | | `1` で kintone に接続せずモック動作 |
| `QC_NOTIFY_CONFIG` | config/notify.json | 通知設定 |
| `QC_NOTIFY_WEBHOOK` | | 設定ファイルの代わりに Webhook URL を直接指定(JSON 形式で送信) |
| `QC_EMBED_KEY` | | Mission Bridge 埋め込み用の共有鍵(16 文字以上) |
| `QC_BACKUP_DIR` / `QC_BACKUP_KEEP` / `QC_BACKUP_INTERVAL_HOURS` | 無効 / 14 / 24 | 定期バックアップ |
| `QC_AUTO_ARCHIVE_DAYS` | 0(無効) | 完了・取消カードの自動アーカイブまでの日数 |

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

パスワード認証 + kintone モック + 埋め込み鍵 + 通知 Webhook(ローカル受け口)+ バックアップ先を指定してサーバーを起動し、
2 つのブラウザで同じボードを開いて次を確認する(65 項目):
同期(カード・ペン)、受付番号の採番、取り消し/やり直し、サイドバーと一覧セルの編集、検索・フィルタ、CSV、画像アップロードとギャラリー、
図面の紐付け、kintone 送信(新規→更新)とレコード番号の書き戻し、閲覧者の読み取り専用(サーバーで拒否)、未ログイン時の 401、
依頼フォーム(画像添付・至急・受付番号表示)、変更履歴(操作者名)、取消(Delete キー含む)、アーカイブと再表示、
検査結果(判定者・判定日の自動記録)、状態遷移の制限、Webhook 通知の内容、管理者 API の権限、バックアップ作成、自動アーカイブ、
PDF の画像化、タブレット幅のサイドバーとピンチズーム、埋め込み連携(トークン・ホスト通知・1 回限り)、永続化と再接続時の復元。
`SHOT_DIR` を指定すると両画面のスクリーンショットを保存する。

## ライセンス

依存ライブラリはすべて MIT ライセンス(React, Konva, react-konva, Yjs, y-websocket, y-protocols, lib0, perfect-freehand, express, ws)。
商用利用に費用・キー・透かし表示は不要。v0.5 まで使っていた tldraw SDK(独自ライセンス)は v0.6 で撤去済み。

## キーボード操作

| キー | 操作 |
|---|---|
| V / H / D / G / E / T / N / A / R / O / C | 選択 / 移動 / ペン / 蛍光 / 消す / 文字 / 付箋 / 矢印 / 四角 / 楕円 / 依頼 |
| Space + ドラッグ | 一時的にパン |
| ホイール / Ctrl+ホイール | パン / ズーム |
| Ctrl+Z / Ctrl+Shift+Z | 元に戻す / やり直す(自分の操作のみ) |
| Ctrl+D / Ctrl+A / Delete / Esc | 複製 / 全選択 / 削除 / 選択解除 |
| + / - / 0 | 拡大 / 縮小 / 全体表示 |
| ダブルクリック | 文字・付箋の編集 |
| 画像をドロップ / 貼り付け | 図面・写真の取り込み |
