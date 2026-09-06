/**
 * 埋め込みモード(Mission Bridge 等のホストアプリ内で表示されている状態)。
 * /embed?token=... で入ると sessionStorage に印を付け、以後の画面遷移でも維持する。
 * ホストへは window.parent.postMessage でイベントを通知する(iframe / webview 双方で受け取れる)。
 */
const KEY = 'qc.embed'

export function isEmbed(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setEmbed(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export type HostEvent =
  | { event: 'ready'; user: { name: string; role: string } }
  | { event: 'board-opened'; roomId: string; title: string }
  | { event: 'card-selected'; roomId: string; shapeId: string | null; partNo?: string; status?: string }
  | { event: 'error'; message: string }

export function notifyHost(e: HostEvent): void {
  if (!isEmbed()) return
  const msg = { source: 'qc-board', ...e }
  try {
    // iframe の場合は親、webview の場合は自分自身(ホストの preload が window.message を中継する想定)
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*')
    else window.postMessage(msg, '*')
  } catch {
    /* ignore */
  }
}
