# ui-kit

`docs/ui-guide` のデモから切り出した、依存なしのバニラJS部品（ESモジュール）。通信・保存は外から注入する設計で、kintone や Electron に依存しない。

```js
// ES モジュール
import { createVirtualList, registerHotkeys, createPersistentStore } from './ui-kit/index.js';
```
```html
<!-- 単一ファイル版（file:// や kintone カスタマイズ JS でも使える。window.UIKit に全 API） -->
<script src="ui-kit/dist/ui-kit.js"></script>
<script>const { createVirtualList } = window.UIKit;</script>
```
`dist/ui-kit.js` は `node ui-kit/build.mjs`（`npm run build`）で各モジュールから生成する。編集はモジュール側で行い、生成物は直接編集しない。

## 実例
`example/index.html`：受注一覧アプリ。5,000件の仮想リスト、デバウンス検索とハイライト、インライン編集の楽観的更新、Undo/Redo（サーバにも反映）、オフラインキュー、リビジョン競合の3方向マージ、分割パネル、ピン留めの並べ替え、削除モーダルのフォーカス管理、ツールチップ位置決め、別ウィンドウ同期、状態の永続化。ブラウザで開くだけで動く。

| モジュール | 主な API |
|---|---|
| `drag.js` | `createDrag(el, {threshold, onStart, onMove, onEnd, onClick})`, `constrain(ctx, {grid})` |
| `camera.js` | `createCamera({minScale, maxScale})`, `attachPanZoom(view, cam)` |
| `virtual-list.js` | `createVirtualList(view, {rowHeight, count, renderRow})`, `flattenTree(nodes)` |
| `undo.js` | `createHistory(initial, {limit})` |
| `hotkeys.js` | `registerHotkeys({'mod+s': fn}, {ignoreInputs, skipPrevented})` |
| `search.js` | `debounce`, `substringMatch`, `fuzzyMatch`, `highlight`, `search(items, needle, {fuzzy})` |
| `offline-queue.js` | `createOfflineQueue({storageKey, send, isOnline})` |
| `merge.js` | `threeWayMerge(base, mine, theirs)`, `wordDiff(a, b)`, `diffToHtml(parts)` |
| `store.js` | `createPersistentStore(key, defaults, {debounceMs})` |
| `sync.js` | `createSyncChannel(name, {onState})` |
| `focus-trap.js` | `activateFocusTrap(container, {inertTargets, onEscape, initialFocus})` → `release()` |
| `position.js` | `computePosition(anchorRect, popRect, {placement, align, gap, bounds})`, `positionAtPoint(point, popRect, bounds)` |
| `toast.js` | `createToaster({host, max, duration, position})` → `show(msg, {kind, duration})` |
| `sortable.js` | `createSortable(listEl, {handle, onChange})` |
| `split.js` | `createSplit(container, {sizes, min, gutter, direction, onChange})` |

各ファイル冒頭に使い方・副作用・元デモ番号を記載。

## テスト
```
node ui-kit/test/run.mjs
```
前提：Node 18+、`playwright` パッケージと Chromium。`PLAYWRIGHT_MODULE`（playwright の解決パス）と `CHROMIUM_PATH` で場所を指定できる。ESモジュールは `file://` では読めないため、実行時に一時 HTTP サーバを立てる。
