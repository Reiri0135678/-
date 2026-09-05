# UI操作レクチャー資料（バニラJS / HTML）

フロントエンドUIの「操作名称」と「動作」を対応づける教材。依存ライブラリなし。各HTMLをブラウザで開くだけで動く（サーバ不要）。

| # | ファイル | 内容 | 状態 |
|---|---|---|---|
| 01 | `01-ui-operations-catalog.html` | UI操作の分類リスト（A:一般 / B:カスタマイズ / C:プロ志向、通し番号01〜62、検索・フィルタ、各項目からデモへリンク） | 完成 |
| 02 | `02-basic.html` | A層 01〜22 の動くデモ（スクロール、パン、ズーム、DnD、フェード、モーダル…） | 完成 |
| 03 | `03-custom.html` | B層 23〜42 の動くデモ（仮想スクロール、慣性、スプリング、FLIP、並べ替え、Undo/Redo…） | 完成 |
| 04 | `04-pro.html` | C層 43〜62 の動くデモ（無限キャンバス、ミニマップ、ノードエディタ、スナップ、データグリッド、Electron…） | 完成 |
| - | `assets/guide.css` / `assets/guide.js` | 共通スタイル、目次生成、コード表示ランタイム | - |

## デモページの読み方
各項目は次の3段構成。
1. **動作の意味**：その操作が何をするものか、何と混同しやすいか
2. **操作してみる**：ページ上で実際に触れる
3. **コードを見る**：折りたたみを開くと、そのデモを動かしている CSS / JS の実物が表示される（表示コード＝実行コード。`data-code` 属性の付いた `<style>` / `<script>` を `guide.js` が転記している）

## 前提・制約
- 動作確認は Chromium 系ブラウザで実施。View Transitions（31）・`popover` 等は対応ブラウザでのみ動き、非対応時はフォールバックする
- 61・62（Electron のフレームレスウィンドウ／ネイティブメニュー）はブラウザ上では動作しないため、模擬動作とメイン／preload／renderer のコード提示にとどめている
- 50（マルチタッチ）はタッチ端末での2本指操作が本来の形。マウスでは Shift+ドラッグで2本目の指を模擬する

## 新しいデモを追加する
`section.demo` を1つ追加し、その中に `<style data-code>` と `<script data-code>` を置くだけで、目次とコード表示は自動生成される。
```html
<section class="demo" id="n63">
  <h2><span class="no">63</span>名称 <small>English</small></h2>
  <p class="what">動作の意味</p>
  <p class="how"><b>操作：</b>…</p>
  <div class="stage">…</div>
  <style data-code>…</style>
  <script data-code>(() => { … })();</script>
</section>
```
