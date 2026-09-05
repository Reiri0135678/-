# 導入手順(社内 LAN のサーバー 1 台で運用する)

対象: Windows Server / Windows 10・11 の常時起動 PC、または Linux。Node.js 22 以上が動けばよい。
所要: 初回 30 分程度。副作用: サーバーに `data/`(ボード・画像・履歴)と `config/`(ユーザー・連携設定)が作られる。

## 1. 準備

1. Node.js 22 LTS をインストール(https://nodejs.org/)。`node -v` で 22 以上を確認
2. リポジトリを取得(Git があれば `git clone`、無ければ ZIP を展開)。以下 `C:\qc-board` に置いた前提
3. 依存の取得とビルド

```bat
cd C:\qc-board
npm ci
npm run build
```

## 2. 設定

### ユーザー(パスワード認証にする場合)

```bat
node scripts\add-user.mjs 山田 <パスワード> admin
node scripts\add-user.mjs 佐藤 <パスワード> member
node scripts\add-user.mjs 見学者 <パスワード> viewer
```

`config\users.json` が無い間は名前だけで入れるオープンモード。まずオープンモードで試し、定着したらユーザー登録に切り替える運用が楽。

### Mission Bridge から埋め込む場合

`QC_EMBED_KEY` に 16 文字以上の秘密文字列を設定し、同じ値を Mission Bridge 側のメインプロセスに持たせる(`examples/mission-bridge-host/`)。

### kintone / 通知

`config\kintone.example.json` → `config\kintone.json`、通知は `config\notify.json`。書き方は `config\README.md`。

### 環境変数(推奨値)

| 変数 | 推奨 | 意味 |
|---|---|---|
| `PORT` | 3000 | 待ち受けポート |
| `QC_DATA_DIR` | `D:\qc-board-data` | データ保存先。OS ドライブと分ける |
| `QC_BACKUP_DIR` | `\\nas\backup\qc-board` または別ドライブ | 定期バックアップ先 |
| `QC_BACKUP_KEEP` | 30 | 保持世代 |
| `QC_AUTO_ARCHIVE_DAYS` | 14 | 完了・取消から 14 日でボードから外す |
| `QC_EMBED_KEY` | (秘密) | Mission Bridge 埋め込み |

## 3. 起動確認

```bat
set PORT=3000
set QC_DATA_DIR=D:\qc-board-data
npm start
```

サーバー自身で http://localhost:3000/ を開き、別 PC から http://<サーバーの IP または名前>:3000/ を開けることを確認。
Windows ファイアウォールで受信ポート 3000(TCP)を許可する。

## 4. 常駐(Windows サービス化)

[NSSM](https://nssm.cc/) を使うのが最も簡単。

```bat
nssm install QcBoard "C:\Program Files\nodejs\node.exe" "C:\qc-board\node_modules\tsx\dist\cli.mjs" "server\src\index.ts"
nssm set QcBoard AppDirectory C:\qc-board
nssm set QcBoard AppEnvironmentExtra PORT=3000 QC_DATA_DIR=D:\qc-board-data QC_BACKUP_DIR=E:\backup\qc-board QC_AUTO_ARCHIVE_DAYS=14
nssm set QcBoard AppStdout C:\qc-board\logs\out.log
nssm set QcBoard AppStderr C:\qc-board\logs\err.log
nssm set QcBoard AppRotateFiles 1
nssm start QcBoard
```

停止は `nssm stop QcBoard`、削除は `nssm remove QcBoard confirm`。サーバー再起動時に自動で立ち上がる。

### Linux(systemd)の場合

```ini
# /etc/systemd/system/qc-board.service
[Unit]
Description=QC Board
After=network.target

[Service]
WorkingDirectory=/opt/qc-board
Environment=PORT=3000 QC_DATA_DIR=/var/lib/qc-board QC_BACKUP_DIR=/var/backups/qc-board QC_AUTO_ARCHIVE_DAYS=14
ExecStart=/usr/bin/npm start
Restart=always
User=qcboard

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now qc-board
```

## 5. HTTPS にする(推奨)

LAN 内でも、パスワードや図面を平文で流さないために HTTPS 化を推奨。[Caddy](https://caddyserver.com/) を前段に置くと設定は 3 行。

```
qc-board.example.local {
    tls internal
    reverse_proxy localhost:3000
}
```

`tls internal` は社内用の自己署名証明書。各 PC に Caddy のルート証明書を配布するか、社内 CA の証明書を指定する。
WebSocket は reverse_proxy がそのまま通す。

## 6. バックアップと復旧

- 自動: `QC_BACKUP_DIR` を設定すれば起動時と 24 時間ごとに `data/` を丸ごとコピー(`QC_BACKUP_KEEP` 世代)
- 手動: `npm run backup`(サーバー稼働中でも可)
- 復旧: サービスを止め、`QC_DATA_DIR` の中身をバックアップの世代フォルダの中身で置き換えて再起動。
  `data/secret`(セッション署名鍵)はバックアップに含めていないので、復旧後は全員が再ログインになる

## 7. 更新(新しい版を入れる)

```bat
nssm stop QcBoard
cd C:\qc-board
git pull            (ZIP の場合は上書き展開)
npm ci
npm run build
nssm start QcBoard
```

`data/` は触らないので、ボードの内容は引き継がれる。

## 8. 動作確認のチェックリスト

- [ ] 別 PC のブラウザからログインしてボードが開く
- [ ] 2 台で同じボードを開き、片方の描画がもう片方に出る(名前付きカーソルが見える)
- [ ] 依頼フォームから送信して受付番号が出る
- [ ] サーバーを再起動しても内容が残る
- [ ] `QC_BACKUP_DIR` にフォルダができている
- [ ] (kintone を使う場合)「kintone へ送信」で新規レコードができる
