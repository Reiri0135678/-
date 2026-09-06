// ui-kit — レクチャー資料（docs/ui-guide）のデモから切り出した再利用部品。依存なし・ESモジュール。
export { createDrag, constrain } from './drag.js';
export { createCamera, attachPanZoom } from './camera.js';
export { createVirtualList, flattenTree } from './virtual-list.js';
export { createHistory } from './undo.js';
export { registerHotkeys } from './hotkeys.js';
export { debounce, substringMatch, fuzzyMatch, highlight, search } from './search.js';
export { createOfflineQueue } from './offline-queue.js';
export { retry, withRetry, httpError, parseRetryAfter, isTransient, backoffDelay, createLimiter } from './retry.js';
export { threeWayMerge, wordDiff, diffToHtml } from './merge.js';
export { createPersistentStore } from './store.js';
export { createSyncChannel } from './sync.js';
export { activateFocusTrap } from './focus-trap.js';
export { computePosition, positionAtPoint } from './position.js';
export { createToaster } from './toast.js';
export { createSortable } from './sortable.js';
export { createSplit } from './split.js';
