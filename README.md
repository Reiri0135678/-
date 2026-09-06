# UI操作レクチャー資料 と ui-kit

フロントエンドUIの「操作の名称」と「実際の動き」を対応づける教材（バニラJS / HTML、依存なし）と、そこから切り出した再利用部品ライブラリ。

| 場所 | 内容 | 使い方 |
|---|---|---|
| [`docs/ui-guide/00-index.html`](docs/ui-guide/00-index.html) | 教材の入口。基礎知識、143項目のカタログと動くデモ（外部連携・3D/AR を含む）、アクセシビリティ、クイズ、練習課題、Electron / kintone リファレンス | ブラウザで開くだけ（サーバ不要） |
| [`docs/ui-guide/dist/ui-guide-standalone.html`](docs/ui-guide/dist/ui-guide-standalone.html) | 上の資料一式を 1 枚にまとめた単一ファイル版（約 1.0 MB、外部参照なし） | 配布・持ち出し用。ダブルクリックで開く |
| [`docs/ui-guide/16-bundler.html`](docs/ui-guide/16-bundler.html) | 単一ファイル版を作るバンドラ | ブラウザだけで生成（Node 不要） |
| [`ui-kit/`](ui-kit/) | 16モジュールの部品ライブラリ（ESM）。`dist/ui-kit.js` は単一ファイル版（`window.UIKit`） | `import` するか `<script src="ui-kit/dist/ui-kit.js">` |
| [`ui-kit/example/index.html`](ui-kit/example/index.html) | 部品を組み合わせた実例アプリ（受注一覧） | ブラウザで開くだけ |
| [`docs/ui-guide/07-implementation-plan.md`](docs/ui-guide/07-implementation-plan.md) | 実アプリへの適用計画 | 読む |

## コマンド
```
npm run build       # ui-kit/*.js → ui-kit/dist/ui-kit.js（依存なし）
npm run build:docs  # 教材の生成物（デモ抽出・検索索引・収録一覧・単一ファイル版）をまとめて作り直す
npm test            # ui-kit のブラウザテスト（Playwright + Chromium が必要）
npm run test:docs   # 教材ページの読み込み・リンク・主要操作の検証（同上）
```
