# チュートリアル：この成果物の使い始め方

**所要 90分。8ステップ。各ステップに「確認できたこと」があるので、そこまで到達したら次へ進む。**

> **[`docs/ui-guide/15-curriculum.html`](docs/ui-guide/15-curriculum.html) との違い**
> あちらは **UI の 143 項目を身につける**ための学習の道筋（9ステップ・数日〜数週間）。
> こちらは **この成果物を仕事で使い始める**ための手順（8ステップ・90分）。まずこちらを一周してから、必要な層だけ学習に進むのが速い。

**前提**：ステップ1〜5 はブラウザだけ（Chromium 系推奨）。ステップ6〜8 は Node 18 以降が要る。
**副作用**：進捗・下書き・作業状態は、その端末のブラウザ（`localStorage`、キーは `ui-guide.*`）に保存される。サーバには何も送らない。

---

## ステップ1（5分）まず開いて、探せることを確かめる

**目的**：この資料が「読む本」ではなく**索引**であることを体感する。

1. [`docs/ui-guide/00-index.html`](docs/ui-guide/00-index.html) をブラウザで開く（**ダブルクリックでよい**。サーバ不要）
2. 上部の検索欄に **`慣性`** と入れる → 該当ページの見出しが出る
3. 結果のリンクから、実際のデモへ飛ぶ
4. [`01-ui-operations-catalog.html`](docs/ui-guide/01-ui-operations-catalog.html) を開き、検索欄に **`パン`** と入れる

> ✅ **確認できたこと**：143 項目のどこに何があるか覚える必要はない。**日本語でも英語名でも番号でも引ける**。
> 名前が分からない操作は、カタログで説明文から探して英語名を得る → その英語名で外部の資料を検索できる。

---

## ステップ2（10分）「表示コード＝実行コード」を自分で確かめる

**目的**：この資料のコードが**写しではない**ことを確認する。ここを疑ったまま進むと、書いてあることを信用できない。

1. [`02-basic.html`](docs/ui-guide/02-basic.html) を開き、**01 スクロール** の「コードを見る」を開く
2. 表示されている CSS に `.s01-box { height: 160px; ... }` があることを確認する
3. ブラウザの開発者ツール（F12）を開き、Console に次を貼る

```js
// 表示されている CSS の値を、その場で書き換える
document.querySelector('#s01-box').style.height = '400px';
```

4. **枠が即座に伸びる**（資料の見た目そのものが変わる）
5. 続けてこれを貼ると、「先頭へ（smooth）」がなめらかに動かなくなる

```js
// 01 の JS は scrollTo({ behavior: 'smooth' }) を使っている。動きの実装を差し替える
const box = document.querySelector('#s01-box');
box.scrollTo = (opt) => Element.prototype.scrollTo.call(box, { ...opt, behavior: 'auto' });
```

6. ページを再読み込みすると元に戻る

> ✅ **確認できたこと**：表示されているコードは、いま動いているそのものである（`data-code` 属性の付いた `<style>` / `<script>` を `assets/guide.js` がその場で転記している）。
> **だから資料が古くなると壊れ、テストが落ちる。** 静かに陳腐化しない。

---

## ステップ3（15分）プレイグラウンドで1つ改造する

**目的**：「読む」から「触る」へ移る。ここを飛ばすと定着しない。

1. [`14-playground.html#n23`](docs/ui-guide/14-playground.html#n23) を開く（23 仮想スクロール）
2. JS 欄の1行目にある **`const TOTAL = 100000`** を **`2000000`**（200万）に変える
3. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> で実行
4. 枠内をスクロールする → 表示が **`全 2,000,000 行 / DOM行数 10 / 表示開始 715`** のようになる（実測値）
5. 各デモの「コードを見る」からも「▶ プレイグラウンドで編集して試す」で飛べる。下書きは自動保存される（「下書きを破棄」で元に戻る）

> ✅ **確認できたこと**：200万行でも **DOM に存在するのは十数行だけ**。仮想スクロールが何をしているかが数字で見える。
> **自分のデータ形に書き換えて試せる場所**がある。
> kintone の一覧を数千件描くときの答えは、ここで試してから実装できる。

---

## ステップ4（10分）現場の端末を「測る」

**目的**：「この端末で何が使えるか」を、調べるのではなく**測って**答えさせる。

1. **実際に現場で使う端末**（工場のタブレット、事務所の PC、iPad）で
   [`18-crossplatform.html#n102`](docs/ui-guide/18-crossplatform.html#n102) を開く
2. 102 の実測パネルの値（ポインタ精度・ホバー可否・dpr・OS）を控える
3. 同じページの **113 機能検出**まで下り、その端末で使える機能の表を見る
4. **107（日本語入力）** の「対策なし」「対策あり」を両方触る ← ステップ6の前提になる

> ✅ **確認できたこと**：ホバーが無い端末、指で 1px を狙えない端末、`dvh` が要る端末が**具体的に分かる**。
> 「一般にタッチ端末では…」ではなく、**その端末の答え**が出る。

---

## ステップ5（15分）外部連携の方式を決める

**目的**：kintone や外部サービスと繋ぐとき、**最初の分岐**を間違えない。

1. [`20-integration.html#n114`](docs/ui-guide/20-integration.html#n114) の4方式表（埋め込み／ブラウザから直接／サーバ経由／Electron）を読み、**いまの案件がどれか決める**
2. [`#n121`](docs/ui-guide/20-integration.html#n121) を開き、ボタンを押す → 画面に置いた「秘密」が数行で読めることを確認する
3. **いま自分が書いているコードに、API キーやトークンが画面側に無いか確認する**
4. [`#n122`](docs/ui-guide/20-integration.html#n122) で3方式（再試行なし／間隔一定／バックオフ＋ジッター）を押し比べる
5. [`#n126`](docs/ui-guide/20-integration.html#n126) の入力欄に、バーコードリーダーがあれば読ませる。無ければ**速く手で打つ**

> ✅ **確認できたこと**：
> - 鍵の置き場所は「サーバか Electron の main」で、画面側には置けない
> - 上限に当たったら**指数バックオフ＋ジッター**（固定間隔で叩き続けると悪化する）
> - **バーコードリーダーの大半はキーボードとして振る舞う**ので、WebHID を調べる前にこちらを試す

---

## ステップ6（10分）自分の既存コードを検査する ★ここが一番効く

**目的**：日本語入力（IME）の誤処理が、**いま動いているコードに埋まっていないか**を機械的に確かめる。

```bash
git clone https://github.com/Reiri0135678/-.git ui-guide && cd ui-guide

# 検査したいフォルダを指定する（読み取りのみ。ファイルは一切変更しない）
node tools/check-ime.mjs /path/to/your/kintone-customize
node tools/check-ime.mjs /path/to/mission-bridge/src
```

出力の読み方：

| 表示 | 意味 | 対応 |
|---|---|---|
| **要修正** | 変換確定の Enter で送信される／未確定文字で検索が走る | 直す |
| **要確認** | 誤爆は少ないが環境依存 | 目視 |
| **目視** | 変換中にも発火する。中身次第 | 中を見る |

直し方は共通で2行：

```js
element.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;   // ← 変換中は何もしない
  if (e.key === 'Enter') submit();
});

// 検索・絞り込みは「変換中は走らせず、確定時に1回だけ」
input.addEventListener('input', e => { if (e.isComposing) return; search(); });
input.addEventListener('compositionend', search);
```

安全と判断した箇所（canvas、スライダー、下書き保存など）は、その行の直前に理由を書いて除外する：

```js
// check-ime-ignore : range のため変換が発生しない
slider.addEventListener('input', update);
```

> ✅ **確認できたこと**：誤検出は出るが、**取りこぼしはしない**。
> 参考までに、この検査を作ったとき **資料本体にも同型のバグが4件残っていた**（目視では取りこぼしていた）。

---

## ステップ7（15分）ui-kit を1つだけ組み込む

**目的**：いきなり全部使わない。**1つ入れて壊れないこと**を確認する。

### 読み込み方（どちらか）

```html
<!-- ① 単一ファイル版。kintone のカスタマイズJS や file:// でも動く -->
<script src="ui-kit/dist/ui-kit.js"></script>
<script>const { registerHotkeys, withRetry } = window.UIKit;</script>
```

```js
// ② ES モジュール（Electron / バンドラあり）
import { registerHotkeys, withRetry, httpError, createLimiter } from './ui-kit/index.js';
```

### 最初の1つ：ショートカット（副作用が小さい）

```js
const dispose = registerHotkeys({
  'mod+s': e => { e.preventDefault(); save(); },   // mod = Windows: Ctrl / Mac: ⌘
  'mod+shift+z': () => redo(),
}, { ignoreInputs: true });   // 単独キーは入力欄の中では発火しない
// 日本語の変換中のキーは無視される（ステップ6と同じ対策が入っている）
```

### 次の1つ：kintone の一括更新に効く再試行

```js
const post = withRetry(async (body, { signal, idempotencyKey }) => {
  const res = await fetch('/k/v1/record.json', { method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body) });
  if (!res.ok) throw httpError(res);       // 429 / 5xx は再試行、4xx はそのまま失敗
  return res.json();
}, { retries: 4, onRetry: i => setStatus(`再試行 ${i.attempt} 回目`) });

const limit = createLimiter(3);            // 一気に投げない（そもそも 429 を出さない）
await Promise.all(rows.map(r => limit(() => post(r, { idempotencyKey: `order-${r.id}` }))));
```

> ✅ **確認できたこと**：部品は**通信も保存も外から注入する**設計なので、kintone にも Electron にも依存しない。
> 実例は [`ui-kit/example/index.html`](ui-kit/example/index.html)（受注一覧アプリ）をブラウザで開くと動く。
> 全 API は [`ui-kit/README.md`](ui-kit/README.md) と型定義 `ui-kit/index.d.ts`。

---

## ステップ8（10分）配布用の1枚を作る

**目的**：ネットワークも Node も無い現場端末に**そのまま渡せる形**にする。

### ブラウザだけで作る（Node 不要）

1. [`16-bundler.html`](docs/ui-guide/16-bundler.html) を開く
2. **「🌐 このページから読み込む」**を押す（`http(s)://` で開いている場合）
   `file://` で開いているときは、フォルダ選択で `docs/ui-guide` を選ぶ
3. **「単一 HTML を生成」** → ダウンロード

### Node で作る

```bash
npm run build:docs     # デモ抽出・検索索引・収録一覧・単一ファイル版を再生成
# → docs/ui-guide/dist/ui-guide-standalone.html（約 1.35 MB、外部参照ゼロ）
```

> ✅ **確認できたこと**：**1枚の HTML をメール添付や USB で渡せば、それだけで全ページ・全デモ・プレイグラウンドが動く**。
> ブラウザ版と Node 版は同じ処理を使っており、出力は一致する。作業手順書や操作説明にも同じ型が使える。

---

## 変更したくなったら

```bash
npm run build:docs     # デモを編集したら必ず実行（生成物が古いとテストが落ちる）
npm run test:docs      # 教材の検証（126件）＋ 検査ツールの自己テスト（9件）
npm test               # ui-kit のテスト（34件）
npm run check:ime -- <フォルダ>   # IME 検査
```

デモを1つ追加するには、`section.demo` を1つ足し、その中に `<style data-code>` と `<script data-code>` を置く。**目次とコード表示は自動生成される**。

```html
<section class="demo" id="n999">
  <h2><span class="no">999</span>名称 <small>English</small></h2>
  <p class="what">何をするものか</p>
  <p class="how"><b>操作：</b>試し方</p>
  <div class="stage">…操作対象とボタンはこの中に置く…</div>
  <script data-code>
    (() => { /* ここが実際に動き、そのまま表示される */ })();
  </script>
</section>
```

> ⚠ 操作ボタンや出力欄は **`.stage` の中か、その直後の `<div class="row">`** に置く。
> それ以外の場所に置くとプレイグラウンドに渡らず、テストが落ちる（実際に一度やった）。

---

## 詰まったときの参照先

| 知りたいこと | 見る場所 |
|---|---|
| 用語・名称が分からない | [`01-ui-operations-catalog.html`](docs/ui-guide/01-ui-operations-catalog.html)（検索・層フィルタ・印刷） |
| なぜこの作りなのか | [`DEVELOPMENT-LOG.md`](DEVELOPMENT-LOG.md)（設計判断と、直した不具合11件の原因） |
| 何が入っているか | [`CHANGELOG.md`](CHANGELOG.md) |
| kintone の制約 | [`13-kintone.html`](docs/ui-guide/13-kintone.html)（**上限値は数値を書いていない。公式仕様で要確認**） |
| Electron の構成 | [`12-electron.html`](docs/ui-guide/12-electron.html) |
| 理解度の確認 | [`11-quiz.html`](docs/ui-guide/11-quiz.html)（全9層から出題） |
| 手を動かす課題 | [`09-exercises.html`](docs/ui-guide/09-exercises.html)（16問、解答例つき） |

## 分かっている制約

- 動作確認は **Chromium 系**で実施。View Transitions・popover などは非対応環境でフォールバックする
- **126（WebHID / WebSerial / WebUSB）は Chromium 系のみ**。接続ボタンは実機がある環境でのみ完走する
- **142（AR）** の実起動には HTTPS と対応端末が要る。ページ上は対応可否の実測表示まで
- 117・120（Cookie 遮断・Electron 認証）は相手サーバや OS が要るため**模擬**。実コードは併記してある
- **kintone の API 上限値は書いていない**。公式 REST API リファレンスで確認すること
