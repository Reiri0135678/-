import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { Auth, canWrite } from './auth'
import { Kintone } from './kintone'
import { backup } from './maintenance'
import { Notifier } from './notify'
import { RoomManager } from './rooms'

const PORT = Number(process.env['PORT'] ?? 3000)
const DATA_DIR = resolve(process.env['QC_DATA_DIR'] ?? 'data')
const UPLOAD_DIR = join(DATA_DIR, 'uploads')
const CLIENT_DIR = resolve('dist/client')
const USERS_FILE = resolve(process.env['QC_USERS_FILE'] ?? 'config/users.json')
const KINTONE_CONFIG = resolve(process.env['QC_KINTONE_CONFIG'] ?? 'config/kintone.json')
const NOTIFY_CONFIG = resolve(process.env['QC_NOTIFY_CONFIG'] ?? 'config/notify.json')
const BACKUP_DIR = process.env['QC_BACKUP_DIR'] ? resolve(process.env['QC_BACKUP_DIR']) : ''
const BACKUP_KEEP = Number(process.env['QC_BACKUP_KEEP'] ?? 14)
const BACKUP_INTERVAL_H = Number(process.env['QC_BACKUP_INTERVAL_HOURS'] ?? 24)
const AUTO_ARCHIVE_DAYS = Number(process.env['QC_AUTO_ARCHIVE_DAYS'] ?? 0)

await mkdir(UPLOAD_DIR, { recursive: true })

const rooms = new RoomManager(join(DATA_DIR, 'rooms'))
await rooms.init()
const auth = new Auth(USERS_FILE, join(DATA_DIR, 'secret'), process.env['QC_EMBED_KEY'])
await auth.init()
const kintone = new Kintone(KINTONE_CONFIG, process.env['KINTONE_MOCK'] === '1')
await kintone.init()
const notifier = new Notifier(NOTIFY_CONFIG)
await notifier.init()
if (process.env['QC_NOTIFY_WEBHOOK']) {
  notifier.configure({ webhookUrl: process.env['QC_NOTIFY_WEBHOOK'], format: 'json' })
}
rooms.onHistory = (roomId, entries, room) => {
  rooms
    .meta(roomId)
    .then((meta) => notifier.fromHistory(entries, roomId, meta?.name ?? roomId, (id) => room.getCard(id)))
    .catch((err) => console.error('[notify] failed', err))
}

// ---- 定期保守: バックアップ・自動アーカイブ ----------------------------------
async function runBackup(): Promise<string | null> {
  if (!BACKUP_DIR) return null
  const dest = await backup(DATA_DIR, BACKUP_DIR, BACKUP_KEEP)
  console.log(`[backup] ${dest}`)
  return dest
}
if (BACKUP_DIR && BACKUP_INTERVAL_H > 0) {
  setInterval(() => runBackup().catch((err) => console.error('[backup] failed', err)), BACKUP_INTERVAL_H * 3600_000).unref()
  setTimeout(() => runBackup().catch((err) => console.error('[backup] failed', err)), 5000).unref()
}
if (AUTO_ARCHIVE_DAYS > 0) {
  const tick = () =>
    rooms
      .autoArchiveAll(AUTO_ARCHIVE_DAYS)
      .then((n) => n && console.log(`[archive] ${n} 件を自動アーカイブ`))
      .catch((err) => console.error('[archive] failed', err))
  setInterval(tick, 3600_000).unref()
  setTimeout(tick, 3000).unref()
}

const app = express()
app.disable('x-powered-by')
const SAFE_ID = /^[A-Za-z0-9_.-]{1,120}$/

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

// 依頼フォームからの投入(カード作成はサーバー側。添付画像は先に /api/uploads へ PUT しておく)
app.post('/api/rooms/:id/requests', auth.require('member'), express.json({ limit: '1mb' }), async (req, res) => {
  const b = req.body ?? {}
  const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max)
  const input = {
    title: str(b.title) || '検査依頼',
    dept: str(b.dept),
    partNo: str(b.partNo),
    lot: str(b.lot),
    qty: str(b.qty, 20),
    note: str(b.note, 2000),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate ?? '')) ? String(b.dueDate) : '',
    priority: b.priority === '至急' ? ('至急' as const) : ('通常' as const),
    requester: str(b.requester, 40) || req.user!.name
  }
  const images = (Array.isArray(b.images) ? b.images : [])
    .filter((i: { id?: string }) => typeof i?.id === 'string' && SAFE_ID.test(i.id))
    .slice(0, 20)
    .map((i: { id: string; name?: string; w?: number; h?: number }) => ({
      src: `/api/uploads/${i.id}`,
      name: str(i.name, 120),
      w: Number(i.w) || 400,
      h: Number(i.h) || 300
    }))
  const card = await rooms.createRequest(String(req.params['id']), req.user!.name, input, images)
  if (!card) {
    res.status(404).json({ error: 'not found' })
    return
  }
  console.log(`[request] ${card.no} on ${req.params['id']} by ${req.user!.name}`)
  res.status(201).json({ id: card.id, no: card.no })
})

app.get('/api/rooms/:id/history', auth.require('viewer'), async (req, res) => {
  const shapeId = typeof req.query['shapeId'] === 'string' ? req.query['shapeId'] : undefined
  const list = await rooms.history(String(req.params['id']), shapeId)
  if (!list) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(list)
})

// ---- 通知・保守(管理者向け) ----------------------------------------------
app.get('/api/notify/status', auth.require('viewer'), (_req, res) => {
  res.json(notifier.status())
})
app.get('/api/notify/recent', auth.require('admin'), (_req, res) => {
  res.json(notifier.sent.slice(-50))
})
app.post('/api/admin/backup', auth.require('admin'), async (_req, res) => {
  try {
    const dest = await runBackup()
    if (!dest) {
      res.status(400).json({ error: 'QC_BACKUP_DIR が未設定です' })
      return
    }
    res.json({ dest })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
app.post('/api/admin/archive', auth.require('admin'), express.json(), async (req, res) => {
  const days = Number(req.body?.days ?? AUTO_ARCHIVE_DAYS)
  if (!(days >= 0)) {
    res.status(400).json({ error: 'days が不正です' })
    return
  }
  res.json({ archived: await rooms.autoArchiveAll(days) })
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
    await rooms.setKintoneIds(id, result.ids, req.user!.name)
    console.log(`[kintone] ${id}: created=${result.created} updated=${result.updated} by ${req.user?.name}`)
    res.json({ created: result.created, updated: result.updated, total: list.length })
  } catch (err) {
    console.error('[kintone] sync failed', err)
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ---- 画像などのアップロード -------------------------------------------

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
  const user = auth.userFromRequest(req)
  if (!m || !user) {
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
        room.connect(ws, user.name, !canWrite(user))
      })
      .catch((err) => {
        console.error('[ws] connect failed', err)
        ws.close(1011, 'INTERNAL')
      })
  })
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    rooms.closeAll().finally(() => process.exit(0))
  })
}

server.listen(PORT, async () => {
  console.log(
    `[qc-board] http://localhost:${PORT}  data=${DATA_DIR}  auth=${await auth.mode()}  embed=${auth.embedEnabled() ? 'on' : 'off'}  kintone=${kintone.status().mode}  notify=${notifier.status().enabled ? 'on' : 'off'}  backup=${BACKUP_DIR || 'off'}  autoArchive=${AUTO_ARCHIVE_DAYS || 'off'}`
  )
})
