# ui-kit

`docs/ui-guide` のデモから切り出した、依存なしのバニラJS部品（ESモジュール）。通信・保存は外から注入する設計で、kintone や Electron に依存しない。

```js
import { createVirtualList, registerHotkeys, createPersistentStore } from './ui-kit/index.js';
```

| モジュール | 主な API |
|---|---|
| `drag.js` | `createDrag(el, {threshold, onStart, onMove, onEnd, onClick})`, `constrain(ctx, {grid})` |
| `camera.js` | `createCamera({minScale, maxScale})`, `attachPanZoom(view, cam)` |
| `virtual-list.js` | `createVirtualList(view, {rowHeight, count, renderRow})`, `flattenTree(nodes)` |
| `undo.js` | `createHistory(initial, {limit})` |
| `hotkeys.js` | `registerHotkeys({'mod+s': fn}, {ignoreInputs})` |
| `search.js` | `debounce`, `substringMatch`, `fuzzyMatch`, `highlight`, `search(items, needle, {fuzzy})` |
| `offline-queue.js` | `createOfflineQueue({storageKey, send, isOnline})` |
| `merge.js` | `threeWayMerge(base, mine, theirs)`, `wordDiff(a, b)`, `diffToHtml(parts)` |
| `store.js` | `createPersistentStore(key, defaults, {debounceMs})` |
| `sync.js` | `createSyncChannel(name, {onState})` |

各ファイル冒頭に使い方・副作用・元デモ番号を記載。

## テスト
```
node ui-kit/test/run.mjs
```
前提：Node 18+、`playwright` パッケージと Chromium。`PLAYWRIGHT_MODULE`（playwright の解決パス）と `CHROMIUM_PATH` で場所を指定できる。ESモジュールは `file://` では読めないため、実行時に一時 HTTP サーバを立てる。
