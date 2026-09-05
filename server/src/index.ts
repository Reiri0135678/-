import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { RoomManager } from './rooms'

const PORT = Number(process.env['PORT'] ?? 3000)
const DATA_DIR = resolve(process.env['QC_DATA_DIR'] ?? 'data')
const UPLOAD_DIR = join(DATA_DIR, 'uploads')
const CLIENT_DIR = resolve('dist/client')

await mkdir(UPLOAD_DIR, { recursive: true })

const rooms = new RoomManager(join(DATA_DIR, 'rooms'))
await rooms.init()

const app = express()
app.disable('x-powered-by')

// ---- ボード一覧 -------------------------------------------------------
app.get('/api/rooms', async (_req, res) => {
  res.json(await rooms.list())
})

app.post('/api/rooms', express.json(), async (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name || name.length > 60) {
    res.status(400).json({ error: 'name は 1〜60 文字' })
    return
  }
  res.status(201).json(await rooms.create(name))
})

// ---- 画像などのアップロード -------------------------------------------
const SAFE_ID = /^[A-Za-z0-9_.-]{1,120}$/

app.put(
  '/api/uploads/:id',
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    const id = req.params['id']
    if (!SAFE_ID.test(id)) {
      res.status(400).json({ error: 'invalid id' })
      return
    }
    await writeFile(join(UPLOAD_DIR, id), req.body as Buffer)
    res.json({ ok: true })
  }
)

app.get('/api/uploads/:id', async (req, res) => {
  const id = req.params['id']
  if (!SAFE_ID.test(id)) {
    res.status(400).end()
    return
  }
  const file = join(UPLOAD_DIR, id)
  if (!existsSync(file)) {
    res.status(404).end()
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
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
  if (!m || !sessionId) {
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
        room.handleSocketConnect({ sessionId, socket: ws })
      })
      .catch((err) => {
        console.error('[ws] connect failed', err)
        ws.close(1011, 'INTERNAL')
      })
  })
})

server.listen(PORT, () => {
  console.log(`[qc-board] http://localhost:${PORT}  data=${DATA_DIR}`)
})

// 参考: 起動時に data/rooms を読むだけなので、readdir/readFile は RoomManager 側で使用
void readdir
void readFile
