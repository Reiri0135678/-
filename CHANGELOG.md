# 変更履歴

## 第6弾（学習体験の改善）
- プレイグラウンド `docs/ui-guide/14-playground.html`：各デモの HTML / CSS / JS を編集して即実行。各デモの「コードを見る」からリンク
- 横断検索：`00-index.html` に全ページの見出し・説明の検索を追加
- 学習進捗：カタログに「理解した」チェックと未習得フィルタ（この端末のブラウザに保存）
- ダークモード：ページ枠のみ対応（OS設定に追従、ヘッダーで切替）。デモ領域は配色固定
- `docs/ui-guide/build.mjs`：デモ抽出と検索索引の生成（`npm run build:docs`）。`verify.mjs` が索引の古さを検知

## 第5弾（再監査の改善、PR #3）
- ui-kit の単一ファイル版 `dist/ui-kit.js` と実例アプリ `example/index.html`
- 教材の検証スクリプト `docs/ui-guide/test/verify.mjs`
- 基礎知識 F11（イベントループと描画タイミング）、kintone カスタマイズJS節、カタログの部品バッジ、リポジトリ README

## 第1〜4弾（PR #2）
- 分類カタログ（86項目）、A〜E層の動くデモ、基礎知識 F1〜F10、アクセシビリティ、名称当てクイズ、練習課題12問、Electron / kintone リファレンス、実装計画
- ui-kit 15モジュールとテスト26件
