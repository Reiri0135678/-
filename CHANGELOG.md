# 変更履歴

## 第9弾（最新機能とクロスプラットフォーム）
- `17-modern.html`（M層 87〜101）：`:has()`、`@starting-style`、popover、アンカー位置指定、`interpolate-size`、`details name`、`field-sizing`、`content-visibility`、`light-dark()`/`color-mix()`、`moveBefore()`、Custom Highlight API、`scheduler.yield()`、新しい標準API、`::scroll-button()`/`::scroll-marker`、`sibling-index()`。各デモは「以前／今」を並べ、端末の対応可否を実測表示
- `18-crossplatform.html`（X層 102〜113）：端末実測パネル、当たり判定、修飾キー、`dvh`、セーフエリア、日本語入力（IME）、`CloseWatcher`、スクロールバー、タッチの癖、日本語テキスト、印刷、機能検出＋実行環境ごとの早見表
- 既存デモの不具合修正：74 検索・36 コマンドパレット・38 インライン編集で日本語変換中の入力／Enter を誤処理していた点、38 で確定直後に編集が再開する点、`ui-kit/hotkeys.js` が変換中のキーを拾う点

## 第8弾（単一ファイル化）
- `docs/ui-guide/dist/ui-guide-standalone.html`：資料一式（ui-kit の部品と実例アプリを含む 42 ファイル）を外部参照なしの 1 枚にまとめた版
- `docs/ui-guide/16-bundler.html`：その 1 枚をブラウザだけで作るバンドラ（Node 不要。フォルダ選択なら `file://` でも動く）
- `docs/ui-guide/assets/bundler.js` / `standalone-shell.js`：組み立て処理と生成物のランタイム。ブラウザと Node が同じものを使い、出力は同一
- `build.mjs`：`assets/manifest.js`（収録一覧）と単一ファイル版も生成するよう拡張

## 第7弾（学習の道筋）
- 学習カリキュラム `15-curriculum.html`：7ステップ、到達目標、チェック保存
- プレイグラウンド：デモごとの下書き自動保存と破棄
- クイズ：「動きを見て当てる」モード（デモを動かして出題）
- 練習課題：各課題から「プレイグラウンドで開く」
- ui-kit：TypeScript 型定義 `index.d.ts`

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
