// QC Board の postMessage をメインプロセスへ中継する preload(WebContentsView / <webview> 共通)
const { ipcRenderer } = require('electron')
window.addEventListener('message', (e) => {
  if (e.data && e.data.source === 'qc-board') ipcRenderer.send('qc-board:event', e.data)
})
