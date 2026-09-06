// Mission Bridge(Electron)側の組み込み例: メインプロセス
// 前提: QC Board サーバーが QC_EMBED_KEY を設定して起動している。
// 副作用: ホスト側は共有鍵を保持する(メインプロセスのみ。レンダラーへ渡さない)。
const { app, BaseWindow, WebContentsView, ipcMain } = require('electron')
const path = require('node:path')

const QC_BOARD_URL = process.env.QC_BOARD_URL ?? 'http://localhost:3000'
const QC_EMBED_KEY = process.env.QC_EMBED_KEY ?? '' // 本番では設定ファイルや資格情報ストアから読む

/** 1) 共有鍵で 60 秒有効・1 回限りのトークンを取得 */
async function fetchEmbedToken(name, role = 'member') {
  const res = await fetch(`${QC_BOARD_URL}/api/auth/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: QC_EMBED_KEY, name, role })
  })
  if (!res.ok) throw new Error(`embed token: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

/** 2) QC Board をウィンドウ内の一領域に埋め込む */
async function openQcBoard(win, { name, role, boardId }) {
  const token = await fetchEmbedToken(name, role)
  const view = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  win.contentView.addChildView(view)
  const layout = () => {
    const { width, height } = win.getContentBounds()
    // 例: 左 260px は Mission Bridge 自身のナビ、右側全面に QC Board
    view.setBounds({ x: 260, y: 0, width: width - 260, height })
  }
  layout()
  win.on('resize', layout)

  const q = new URLSearchParams({ token, ...(boardId ? { board: boardId } : {}) })
  await view.webContents.loadURL(`${QC_BOARD_URL}/embed?${q}`)
  return view
}

// 3) QC Board からのイベント(preload が中継)を受け取る
ipcMain.on('qc-board:event', (_e, msg) => {
  // msg.event: 'ready' | 'board-opened' | 'card-selected' | 'error'
  console.log('[qc-board]', msg)
})

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1500, height: 950 })
  // Mission Bridge のログインユーザー名・役割をそのまま渡す
  await openQcBoard(win, { name: '山田', role: 'member', boardId: undefined })
})
app.on('window-all-closed', () => app.quit())
