# 変更履歴

## 第12弾（チュートリアル）
- `TUTORIAL.md`（新規）：**この成果物を仕事で使い始めるまでの8ステップ（90分）**。学習の道筋（`15-curriculum.html`、UI の 143 項目を身につける／数日〜数週間）とは目的が違うことを冒頭で明示した
  - ①資料を探す ②「表示コード＝実行コード」を自分で確かめる ③プレイグラウンドで改造する ④現場端末を実測する ⑤外部連携の方式を決める ⑥**既存コードを IME 検査する** ⑦ui-kit を1つ組み込む ⑧配布用の1枚を作る
  - 各ステップに「確認できたこと」を置き、**手順は実際にブラウザで実行して動くことを確認**した（②の書き換え、③の 200万行、⑤の 121、⑧のボタン名）
- 単一ファイル版にルートの `.md`（TUTORIAL / README / CHANGELOG / DEVELOPMENT-LOG）を収録するようにした。**教材からのリンクが 1 枚版の中でも切れない**（収録 56 ファイル、約 1.39 MB）
- `00-index.html`・`15-curriculum.html` から導線を追加
- 検証：単一ファイル版から TUTORIAL.md を開けることの回帰テストを追加（127件）


## 第11弾（IME 検査ツールと、それが見つけた修正）
- `tools/check-ime.mjs`（新規）：**任意のフォルダを走査して、日本語入力の変換中イベントを誤処理していそうな箇所を報告する**。依存なし・読み取りのみ。DOM / React / Vue / Svelte / jQuery の登録の書き方に対応し、`要修正 / 要確認 / 目視` の3段階で file:line と直し方を出す。意図的に対策しない箇所は `check-ime-ignore` コメントで除外できる。`npm run check:ime -- <フォルダ>`
- `tools/test/check-ime.test.mjs`：検査器の自己テスト（壊れた書き方を必ず拾い、対策済みの書き方は指摘しない、を固定。9件）
- **この検査で、資料本体に同型のバグが4件残っていたことが判明し、修正した**
  - `00-index.html` 横断検索：変換中に検索が走っていた
  - `05-advanced.html` 81 ワークスペース／82 ルーティングの絞り込み：変換中に絞り込みと再描画が走っていた
  - `ui-kit/example/index.html` 実例アプリの検索：同上
  - `14-playground.html` の Ctrl/⌘+Enter：変換中にも実行されていた
  - いずれも `isComposing` で弾き、`compositionend` で1回だけ走らせる形に統一
- 誤検出だった箇所（canvas・range/checkbox・下書き保存・`e.target === td` で除外済みの箇所）には、理由を書いた `check-ime-ignore` を付けた
- 検証：`test:docs` に 00 横断検索と 81 絞り込みの回帰テストを追加（126件）。`npm run test:docs` は検査器の自己テストも続けて実行する


## 第10弾（サードパーティ連携と 3D・AR）
- `20-integration.html`（Y層 114〜127）：連携方式の選び方、iframe と `postMessage`、`sandbox` / `frame-ancestors`、埋め込みでログインが切れる問題（3rd party Cookie / CHIPS / Storage Access API）、CORS とプリフライト、OAuth 2.1 と PKCE（`crypto.subtle` で実際に S256 を計算）、Electron の認証と `safeStorage`、鍵を画面に置かない、レート制限と再試行（429 / `Retry-After` / 指数バックオフ＋ジッター / 冪等キー）、Webhook の受け側（HMAC 署名の定数時間比較・リプレイ拒否・冪等）、反映方式の選び方（ポーリング／SSE／WebSocket を同じ画面で比較）、ファイルの授受（File System Access / ドロップ / 貼り付け / Web Share を実測）、現場機器との連携（WebHID / WebSerial / WebUSB ＋ キーボード型リーダーの判定）、埋め込みウィジェットと Shadow DOM
- `21-3d.html`（Z層 128〜143）：座標系と行列、カメラ操作（オービット／パン／ドリー）、ビューキューブと投影方式、WebGPU と WebGL2、ピッキング（レイキャストとカラーID の実測比較）、変形ギズモ、スナップ、選択の可視化、計測、断面（クリッピング平面）、分解図、注釈・ホットスポット（遮蔽判定つき）、glTF の書き出し／読み込みと CAD 形式からの変換、大規模モデルの性能、AR（WebXR / Scene Viewer / Quick Look の対応を実測）、ライブラリ選定
- `assets/mini3d.js`：依存ゼロの WebGL2 レンダラ（行列演算・形状生成・レイキャスト・GPU カラーIDピッキング・クリッピング・3D→画面の射影・オービット操作）。Z層のデモはすべてこれで動き、three.js / `<model-viewer>` の参考コードを併記する
- `19-plan-integration-3d.md`：上記2ページの設計方針（2026年時点のブラウザ状況をウェブ調査で確認したうえでの方針）
- カタログ（01）に Y層・Z層を追加して全143項目に。入口（00）・カリキュラム（15、9ステップに）・横断検索・単一ファイル版も追随
- 追記（不足の補完）
  - プレイグラウンドの不具合修正：3D デモで `Mini3D is not defined`（`assets/mini3d.js` が読まれていなかった）、および `.stage` の外に置いた操作ボタン・出力欄が取り込まれず null 参照になっていた問題。`build.mjs` が `.stage` に続く兄弟の `<div class="row">` も取り込むようにし、**全 151 デモがエラーなしで動くことを毎回テストする**ようにした
  - `10-accessibility.html` に **A7「canvas と 3D の代替経路」**：canvas の中身は支援技術から見えないため、`tabindex` ＋ `role` ＋ 矢印キー操作 ＋ `aria-live` ＋ 代替一覧で経路を作る（キーボードだけで選択できる実動デモ）。A6 のチェックリストにも canvas・iframe の `title`・再試行中の状態の3行を追加
  - `11-quiz.html`：出題範囲に M・X・Y・Z 層を追加（従来は A〜E のみで、第5弾以降の項目が出題されなかった）
  - `09-exercises.html`：課題13〜16 を追加（再試行の可視化 / Webhook の順序入れ替わり / 計測のスナップ / 3Dビューのキーボード操作）
  - `12-electron.html`・`13-kintone.html` から Y層（122 レート制限・126 機器連携・120/121 鍵の置き場所）への導線を追加
  - `19-plan-integration-3d.md` の冒頭に実装済みであることと採用した依存方針を明記
- `ui-kit/retry.js`（16 個目の部品）：122 のレート制限対応を切り出した。`retry(fn, {retries, baseMs, maxMs, shouldRetry, onRetry, signal})`、`withRetry(fn, opts)`（冪等キーを再試行間で固定して渡す）、`httpError(res)`（`Retry-After` を秒に直して持つ Error を作る）、`parseRetryAfter`（秒数と HTTP-date の両方）、`isTransient`（429 / 408 / 5xx / 通信断のみ再試行）、`backoffDelay`（指数バックオフ＋ジッター）、`createLimiter(n)`（同時実行数を絞る）。`AbortSignal` で待機中も中断できる。型定義・単一ファイル版・テスト8件を追加（ui-kit 全体で 34件）
  - `ui-kit/build.mjs` が `export async function` も扱えるようにした
  - カタログ 122 に部品バッジ、デモ 122 に `fetch` での使用例を追加
- 検証：`test/verify.mjs` に Y層・Z層・A7・クイズ・全デモ実行のチェックを追加（122件）

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
