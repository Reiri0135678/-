# QC Board

品質管理室が各部門から紙で受け取っている検査依頼をデジタル化するための業務アプリ。
ホワイトボード型キャンバスを土台に、後段でスプレッドシート式リスト・画像一覧・kintone 連携を載せていく。

## 技術構成

- Electron + electron-vite + React 19 + TypeScript
- キャンバス: tldraw SDK 5.x(`src/renderer/src/canvas/` に依存を閉じ込める)
- データ保存: 現状はローカル(IndexedDB, `persistenceKey`)。kintone 保存は後段

## 開発

```bash
npm install
npm run dev        # ホットリロード付きで起動
npm run typecheck  # 型チェック
npm run build      # out/ にビルド
```

### 検証用フラグ(環境変数)

| 変数 | 効果 |
|---|---|
| `QC_DEMO=1` | 空のボードにサンプルの依頼カードと付箋を自動配置 |
| `QC_SCREENSHOT=<path>` | 描画完了後にスクリーンショットを保存して終了(CI・ヘッドレス検証用) |

ヘッドレス環境での動作確認例:

```bash
npm run build
QC_DEMO=1 QC_SCREENSHOT=./shot.png xvfb-run -a npx electron --no-sandbox --disable-gpu .
```

## ライセンスに関する注意

tldraw SDK は本番利用時にライセンスキーが必要(未指定だと透かし表示と警告が出る)。
正式運用前にライセンス条件を確認し、必要なら `Tldraw` の `licenseKey` を設定すること。
