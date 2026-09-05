# UI操作レクチャー資料 と ui-kit

フロントエンドUIの「操作の名称」と「実際の動き」を対応づける教材（バニラJS / HTML、依存なし）と、そこから切り出した再利用部品ライブラリ。

| 場所 | 内容 | 使い方 |
|---|---|---|
| [`docs/ui-guide/00-index.html`](docs/ui-guide/00-index.html) | 教材の入口。基礎知識、86項目のカタログと動くデモ、アクセシビリティ、クイズ、練習課題、Electron / kintone リファレンス | ブラウザで開くだけ（サーバ不要） |
| [`ui-kit/`](ui-kit/) | 15モジュールの部品ライブラリ（ESM）。`dist/ui-kit.js` は単一ファイル版（`window.UIKit`） | `import` するか `<script src="ui-kit/dist/ui-kit.js">` |
| [`ui-kit/example/index.html`](ui-kit/example/index.html) | 部品を組み合わせた実例アプリ（受注一覧） | ブラウザで開くだけ |
| [`docs/ui-guide/07-implementation-plan.md`](docs/ui-guide/07-implementation-plan.md) | 実アプリへの適用計画 | 読む |

## コマンド
```
npm run build       # ui-kit/*.js → ui-kit/dist/ui-kit.js（依存なし）
npm test            # ui-kit のブラウザテスト（Playwright + Chromium が必要）
npm run test:docs   # 教材ページの読み込み・リンク・主要操作の検証（同上）
```
