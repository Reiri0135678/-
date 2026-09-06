// ui-kit の型定義（TypeScript / エディタ補完用）。実装は各 .js。
// import { createVirtualList } from './ui-kit/index.js';  ← この宣言が当たる

export interface DragContext {
  x: number; y: number; startX: number; startY: number; dx: number; dy: number;
  shift: boolean; alt: boolean; ctrl: boolean; meta: boolean; event: PointerEvent; state: 'idle' | 'pressed' | 'dragging';
}
export interface DragOptions {
  threshold?: number; capture?: boolean; button?: number; filter?: (e: PointerEvent) => boolean;
  onStart?: (ctx: DragContext) => void; onMove?: (ctx: DragContext) => void; onEnd?: (ctx: DragContext) => void;
  onClick?: (ctx: DragContext) => void; onCancel?: (ctx: DragContext) => void;
}
export function createDrag(el: HTMLElement, opts?: DragOptions): () => void;
export function constrain(ctx: { dx: number; dy: number; shift?: boolean; alt?: boolean }, opts?: { grid?: number; axisLock?: boolean; snap?: boolean }): { dx: number; dy: number };

export interface Camera {
  x: number; y: number; scale: number; readonly transform: string;
  toWorld(sx: number, sy: number): { x: number; y: number };
  toScreen(wx: number, wy: number): { x: number; y: number };
  panBy(dx: number, dy: number): Camera;
  zoomAt(sx: number, sy: number, factor: number): Camera;
  set(next: Partial<{ x: number; y: number; scale: number }>): Camera;
  subscribe(fn: (cam: Camera) => void): () => void;
}
export function createCamera(opts?: { x?: number; y?: number; scale?: number; minScale?: number; maxScale?: number }): Camera;
export function attachPanZoom(view: HTMLElement, cam: Camera, opts?: { wheelSensitivity?: number; filter?: (e: PointerEvent) => boolean }): () => void;

export interface VirtualList {
  setCount(n: number): void; refresh(): void; range(): { start: number; end: number }; scrollToIndex(i: number): void; dispose(): void;
}
export function createVirtualList(view: HTMLElement, opts: { rowHeight: number; count?: number; overscan?: number; renderRow: (index: number) => string | Node }): VirtualList;
export function flattenTree<T extends Record<string, any>>(nodes: T[], opts?: { children?: string; open?: string }): { node: T; depth: number }[];

export interface History<S> {
  readonly state: S; readonly canUndo: boolean; readonly canRedo: boolean;
  commit(next: S): S; undo(): S; redo(): S; subscribe(fn: (state: S) => void): () => void;
}
export function createHistory<S>(initial: S, opts?: { limit?: number }): History<S>;

export function registerHotkeys(map: Record<string, (e: KeyboardEvent) => void>, opts?: { target?: EventTarget & { activeElement?: Element | null }; ignoreInputs?: boolean; skipPrevented?: boolean }): () => void;

export interface Match { score: number; ranges: [number, number][] }
export function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F & { cancel(): void };
export function substringMatch(text: string, needle: string): Match | null;
export function fuzzyMatch(text: string, needle: string): Match | null;
export function highlight(text: string, ranges: [number, number][], tag?: string): string;
export function search<T>(items: T[], needle: string, opts?: { text?: (item: T) => string; fuzzy?: boolean; limit?: number }): ({ item: T } & Match)[];

export interface OfflineQueue<J = any> {
  readonly size: number; readonly jobs: (J & { id: number })[]; readonly busy: boolean;
  push(job: J): Promise<{ sent: number; failed: { job: J; err: unknown } | null }>;
  flush(): Promise<{ sent: number; failed: { job: J; err: unknown } | null }>;
  clear(): void; subscribe(fn: (q: OfflineQueue<J>) => void): () => void;
}
export function createOfflineQueue<J = any>(opts: { storageKey: string; send: (job: J & { id: number }) => Promise<unknown>; isOnline?: () => boolean; storage?: Pick<Storage, 'getItem' | 'setItem'> | null }): OfflineQueue<J>;

export type Change = 'mine' | 'theirs' | 'both' | 'none';
export function threeWayMerge<T extends Record<string, any>>(base: T, mine: T, theirs: T, opts?: { prefer?: 'mine' | 'theirs' }): { merged: T; conflicts: { key: keyof T; base: any; mine: any; theirs: any }[]; changes: Record<keyof T, Change> };
export function wordDiff(a: string, b: string): { type: 'same' | 'del' | 'ins'; text: string }[];
export function diffToHtml(parts: { type: 'same' | 'del' | 'ins'; text: string }[]): string;

export interface PersistentStore<S> { get(): S; set(patch: Partial<S>): S; flush(): void; reset(): void; subscribe(fn: (state: S) => void): () => void }
export function createPersistentStore<S extends Record<string, any>>(key: string, defaults: S, opts?: { debounceMs?: number; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null }): PersistentStore<S>;

export interface SyncChannel<S> { readonly id: string; publish(state: S): void; hello(getState: () => S): void; dispose(): void }
export function createSyncChannel<S = any>(name: string, opts?: { onState?: (state: S, from: string) => void; storage?: Pick<Storage, 'setItem'> | null }): SyncChannel<S>;

export function activateFocusTrap(container: HTMLElement, opts?: { inertTargets?: HTMLElement[]; onEscape?: (e: KeyboardEvent) => void; initialFocus?: string | HTMLElement }): { release(): void };

export interface Rect { left: number; top: number; right?: number; bottom?: number; width: number; height: number }
export type Placement = 'top' | 'bottom' | 'left' | 'right';
export function computePosition(anchor: Rect & { right: number; bottom: number }, pop: { width: number; height: number }, opts?: { placement?: Placement; align?: 'center' | 'start' | 'end'; gap?: number; bounds?: { left: number; top: number; right: number; bottom: number } }): { left: number; top: number; placement: Placement };
export function positionAtPoint(point: { x: number; y: number }, pop: { width: number; height: number }, bounds?: { left: number; top: number; right: number; bottom: number }): { left: number; top: number };

export interface Toaster { show(message: string, opts?: { kind?: string; duration?: number }): { dismiss(): void }; dispose(): void }
export function createToaster(opts?: { host?: HTMLElement; max?: number; duration?: number; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }): Toaster;

export function createSortable(list: HTMLElement, opts?: { handle?: string; onChange?: (items: Element[]) => void; liftedClass?: string }): () => void;

export interface Split { getSizes(): (number | null)[]; setSizes(sizes: (number | null)[]): void; dispose(): void }
export function createSplit(container: HTMLElement, opts?: { sizes?: (number | null)[]; min?: number; gutter?: number; direction?: 'horizontal' | 'vertical'; onChange?: (sizes: (number | null)[]) => void }): Split;
