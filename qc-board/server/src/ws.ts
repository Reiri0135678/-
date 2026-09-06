import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { canWrite, type Auth } from './auth'
import type { RoomManager } from './rooms'

/** WebSocket 同期: /api/connect/:roomId をログイン済みユーザーだけに開く(閲覧者は読み取り専用) */
export function attachWebSocket(server: Server, auth: Auth, rooms: RoomManager): void {
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
}
