import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Auth } from './auth'
import { AUTO_ARCHIVE_DAYS, BACKUP_DIR, BACKUP_INTERVAL_H, BACKUP_KEEP, BEHIND_HTTPS_PROXY, CLIENT_DIR, DATA_DIR, KINTONE_CONFIG, NOTIFY_CONFIG, PORT, UPLOAD_DIR, USERS_FILE, VERSION } from './config'
import { Kintone } from './kintone'
import { backup } from './maintenance'
import { Notifier } from './notify'
import { RoomManager } from './rooms'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { roomRoutes } from './routes/rooms'
import { templateRoutes } from './routes/templates'
import { uploadRoutes } from './routes/uploads'
import { versionRoutes } from './routes/versions'
import { attachWebSocket } from './ws'


await mkdir(UPLOAD_DIR, { recursive: true })

const rooms = new RoomManager(join(DATA_DIR, 'rooms'))
await rooms.init()
const auth = new Auth(USERS_FILE, join(DATA_DIR, 'secret'), process.env['QC_EMBED_KEY'], BEHIND_HTTPS_PROXY)
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
if (BEHIND_HTTPS_PROXY) app.set('trust proxy', 1)
// 死活監視用(ロードバランサ・Docker の HEALTHCHECK が叩く。認証不要、内容は最小限)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: VERSION, rooms: rooms.openCount() })
})
app.use(authRoutes(auth))
app.use(roomRoutes(auth, rooms, kintone))
app.use(templateRoutes(auth))
app.use(versionRoutes(auth, rooms))
app.use(adminRoutes(auth, rooms, notifier, runBackup))
app.use(uploadRoutes(auth))

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

const server = createServer(app)
attachWebSocket(server, auth, rooms)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    rooms.closeAll().finally(() => process.exit(0))
  })
}

server.listen(PORT, async () => {
  console.log(
    `[qc-board] http://localhost:${PORT}  data=${DATA_DIR}  auth=${await auth.mode()}  embed=${auth.embedEnabled() ? 'on' : 'off'}  kintone=${kintone.status().mode}  notify=${notifier.status().enabled ? 'on' : 'off'}  backup=${BACKUP_DIR || 'off'}  autoArchive=${AUTO_ARCHIVE_DAYS || 'off'}  httpsProxy=${BEHIND_HTTPS_PROXY ? 'on' : 'off'}`
  )
})
