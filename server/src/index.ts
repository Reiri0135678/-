import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { Auth, canWrite } from './auth'
import { Kintone } from './kintone'
import { RoomManager } from './rooms'

const PORT = Number(process.env['PORT'] ?? 3000)
const DATA_DIR = resolve(process.env['QC_DATA_DIR'] ?? 'data')
const UPLOAD_DIR = join(DATA_DIR, 'uploads')
const CLIENT_DIR = resolve('dist/client')
const USERS_FILE = resolve(process.env['QC_USERS_FILE'] ?? 'config/users.json')
const KINTONE_CONFIG = resolve(process.env['QC_KINTONE_CONFIG'] ?? 'config/kintone.json')

await mkdir(UPLOAD_DIR, { recursive: true })

const rooms = new RoomManager(join(DATA_DIR, 'rooms'))
await rooms.init()
const auth = new Auth(USERS_FILE, join(DATA_DIR, 'secret'), process.env['QC_EMBED_KEY'])
await auth.init()
const kintone = new Kintone(KINTONE_CONFIG, process.env['KINTONE_MOCK'] === '1')
await kintone.init()

const app = express()
app.disable('x-powered-by')

// ---- 認証 -------------------------------------------------------------
app.get('/api/auth/mode', async (_req, res) => {
  res.json({ mode: await auth.mode() })
})

app.post('/api/auth/login', express.json(), async (req, res) => {
  const user = await auth.login(String(req.body?.name ?? ''), req.body?.password)
  if (!user) {
    res.status(401).json({ error: '名前またはパスワードが違います' })
    return
  }
  res.setHeader('Set-Cookie', auth.issueCookie(user))
  res.json(user)
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', auth.clearCookie())
  res.json({ ok: true })
})

app.get('/api/auth/me', auth.require('viewer'), (req, res) => {
  res.json(req.user)
})

// 外部アプリ(Mission Bridge 等)からの代理ログイン。
// 1) ホスト側が共有鍵でトークンを取得 → 2) /embed?token=... を開く → 3) クライアントがトークンをセッションに交換
app.post('/api/auth/embed', express.json(), (req, res) => {
  if (!auth.embedEnabled()) {
    res.status(404).json({ error: '埋め込み連携が無効です(QC_EMBED_KEY 未設定)' })
    return
  }
  const token = auth.issueEmbedToken(
    String(req.body?.key ?? ''),
    String(req.body?.name ?? ''),
    (req.body?.role ?? 'member') as 'admin' | 'member' | 'viewer'
  )
  if (!token) {
    res.status(401).json({ error: '鍵が違うか、name/role が不正です' })
    return
  }
  res.json({ token, expiresIn: 60 })
})

app.post('/api/auth/token', express.json(), (req, res) => {
  const user = auth.redeemEmbedToken(String(req.body?.token ?? ''))
  if (!user) {
    res.status(401).json({ error: 'トークンが無効または期限切れです' })
    return
  }
  res.setHeader('Set-Cookie', auth.issueCookie(user))
  res.json(user)
})

// ---- ボード一覧 -------------------------------------------------------
app.get('/api/rooms', auth.require('viewer'), async (_req, res) => {
  res.json(await rooms.list())
})

app.post('/api/rooms', auth.require('member'), express.json(), async (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name || name.length > 60) {
    res.status(400).json({ error: 'name は 1〜60 文字' })
    return
  }
  res.status(201).json(await rooms.create(name))
})

app.get('/api/rooms/:id/requests', auth.require('viewer'), async (req, res) => {
  const list = await rooms.listRequests(String(req.params['id']))
  if (!list) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(list)
})

// ---- kintone ----------------------------------------------------------
app.get('/api/kintone/status', auth.require('viewer'), (_req, res) => {
  res.json(kintone.status())
})

app.post('/api/rooms/:id/kintone/sync', auth.require('member'), async (req, res) => {
  const id = String(req.params['id'])
  const list = await rooms.listRequests(id)
  if (!list) {
    res.status(404).json({ error: 'not found' })
    return
  }
  try {
    const result = await kintone.sync(list)
    await rooms.setKintoneIds(id, result.ids)
    console.log(`[kintone] ${id}: created=${result.created} updated=${result.updated} by ${req.user?.name}`)
    res.json({ created: result.created, updated: result.updated, total: list.length })
  } catch (err) {
    console.error('[kintone] sync failed', err)
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ---- 画像などのアップロード -------------------------------------------
const SAFE_ID = /^[A-Za-z0-9_.-]{1,120}$/

app.put(
  '/api/uploads/:id',
  auth.require('member'),
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    const id = String(req.params['id'])
    if (!SAFE_ID.test(id)) {
      res.status(400).json({ error: 'invalid id' })
      return
    }
    await writeFile(join(UPLOAD_DIR, id), req.body as Buffer)
    res.json({ ok: true })
  }
)

app.get('/api/uploads/:id', auth.require('viewer'), async (req, res) => {
  const id = String(req.params['id'])
  if (!SAFE_ID.test(id)) {
    res.status(400).end()
    return
  }
  const file = join(UPLOAD_DIR, id)
  if (!existsSync(file)) {
    res.status(404).end()
    return
  }
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.sendFile(file)
})

// ---- 静的配信(ビルド済みクライアント) -------------------------------
if (existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR))
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(join(CLIENT_DIR, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res
      .type('text')
      .send('client がビルドされていません。開発時は `npm run dev` で Vite (5173) からアクセスしてください。')
  })
}

// ---- WebSocket 同期 ---------------------------------------------------
const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const m = url.pathname.match(/^\/api\/connect\/([^/]+)$/)
  const sessionId = url.searchParams.get('sessionId')
  const user = auth.userFromRequest(req)
  if (!m || !sessionId || !user) {
    socket.destroy()
    return
  }
  const roomId = decodeURIComponent(m[1]!)
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    rooms
      .get(roomId)
      .then((room) => {
        if (!room) {
          ws.close(4004, 'NOT_FOUND')
          return
        }
        room.handleSocketConnect({ sessionId, socket: ws, isReadonly: !canWrite(user) })
      })
      .catch((err) => {
        console.error('[ws] connect failed', err)
        ws.close(1011, 'INTERNAL')
      })
  })
})

server.listen(PORT, async () => {
  console.log(
    `[qc-board] http://localhost:${PORT}  data=${DATA_DIR}  auth=${await auth.mode()}  embed=${auth.embedEnabled() ? 'on' : 'off'}  kintone=${kintone.status().mode}`
  )
})
