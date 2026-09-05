import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WebSocket } from 'ws'
import { normalizeShape, toRequestRecord, type RequestRecord, type Shape } from '../../shared/shapes'

export interface RoomMeta {
  id: string
  name: string
  createdAt: string
}

const DEFAULT_ROOMS = ['品質管理室', '製造1課', '製造2課']
const PERSIST_DELAY_MS = 1000
const ROOM_ID = /^[A-Za-z0-9_-]{1,40}$/

// y-websocket 互換のメッセージ種別
const MSG_SYNC = 0
const MSG_AWARENESS = 1

interface Conn {
  ws: WebSocket
  readonly: boolean
  user: string
  /** この接続が管理する awareness clientID(切断時に消す) */
  controlled: Set<number>
}

/**
 * 1 ボード = 1 Y.Doc。接続ごとに y-websocket 互換プロトコルで同期する。
 * 閲覧のみ(readonly)の接続からの更新は無視する(サーバー側で権限を強制)。
 * 永続化: 変更の 1 秒後、または最後の接続が切れた時に data/rooms/<id>.yjs へバイナリ更新を保存。
 */
class Room {
  readonly doc = new Y.Doc()
  readonly awareness = new awarenessProtocol.Awareness(this.doc)
  readonly conns = new Set<Conn>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    readonly id: string,
    private readonly file: string
  ) {
    this.awareness.setLocalState(null)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc), origin)
      this.schedulePersist()
    })
    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const changed = [...added, ...updated, ...removed]
        if (origin instanceof Object && 'controlled' in origin) {
          const c = origin as Conn
          added.forEach((id) => c.controlled.add(id))
          removed.forEach((id) => c.controlled.delete(id))
        }
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG_AWARENESS)
        encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed))
        this.broadcast(encoding.toUint8Array(enc), null)
      }
    )
  }

  async load(): Promise<void> {
    if (!existsSync(this.file)) return
    try {
      Y.applyUpdate(this.doc, new Uint8Array(await readFile(this.file)), 'load')
    } catch (err) {
      console.error(`[room] load failed ${this.id}`, err)
    }
  }

  get shapes(): Y.Map<Y.Map<unknown>> {
    return this.doc.getMap('shapes') as Y.Map<Y.Map<unknown>>
  }

  listShapes(): Shape[] {
    const out: Shape[] = []
    this.shapes.forEach((m) => {
      const s = normalizeShape(m.toJSON() as Record<string, unknown>)
      if (s) out.push(s)
    })
    return out
  }

  connect(ws: WebSocket, user: string, readonly: boolean): void {
    const conn: Conn = { ws, readonly, user, controlled: new Set() }
    this.conns.add(conn)
    ws.binaryType = 'arraybuffer'

    ws.on('message', (data: ArrayBuffer | Buffer) => {
      try {
        this.onMessage(conn, new Uint8Array(data as ArrayBuffer))
      } catch (err) {
        console.error(`[room] bad message from ${user}`, err)
      }
    })
    const close = () => {
      if (!this.conns.has(conn)) return
      this.conns.delete(conn)
      awarenessProtocol.removeAwarenessStates(this.awareness, [...conn.controlled], null)
      if (this.conns.size === 0) void this.persist()
    }
    ws.on('close', close)
    ws.on('error', close)

    // 初回: sync step1 と現在の awareness を送る
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, MSG_SYNC)
    syncProtocol.writeSyncStep1(enc, this.doc)
    this.send(conn, encoding.toUint8Array(enc))
    const states = this.awareness.getStates()
    if (states.size > 0) {
      const e2 = encoding.createEncoder()
      encoding.writeVarUint(e2, MSG_AWARENESS)
      encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]))
      this.send(conn, encoding.toUint8Array(e2))
    }
  }

  private onMessage(conn: Conn, data: Uint8Array): void {
    const dec = decoding.createDecoder(data)
    const type = decoding.readVarUint(dec)
    if (type === MSG_SYNC) {
      const syncType = decoding.readVarUint(dec)
      if (syncType === syncProtocol.messageYjsSyncStep1) {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MSG_SYNC)
        syncProtocol.writeSyncStep2(enc, this.doc, decoding.readVarUint8Array(dec))
        this.send(conn, encoding.toUint8Array(enc))
      } else if (!conn.readonly) {
        // step2 も update も「更新を適用」で同じ
        Y.applyUpdate(this.doc, decoding.readVarUint8Array(dec), conn)
      }
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), conn)
    }
  }

  private send(conn: Conn, data: Uint8Array): void {
    if (conn.ws.readyState !== conn.ws.OPEN) return
    conn.ws.send(data, (err) => err && console.error('[room] send failed', err))
  }

  private broadcast(data: Uint8Array, except: unknown): void {
    for (const c of this.conns) if (c !== except) this.send(c, data)
  }

  private schedulePersist(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.persist()
    }, PERSIST_DELAY_MS)
  }

  async persist(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      await writeFile(this.file, Y.encodeStateAsUpdate(this.doc))
    } catch (err) {
      console.error(`[room] persist failed ${this.id}`, err)
    }
  }

  destroy(): void {
    this.awareness.destroy()
    this.doc.destroy()
  }
}

/** ボード(ルーム)の生成・読込・永続化・kintone 書き戻しを担当 */
export class RoomManager {
  private readonly live = new Map<string, Room>()

  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    if ((await this.list()).length === 0) {
      for (const name of DEFAULT_ROOMS) await this.create(name)
    }
  }

  async list(): Promise<RoomMeta[]> {
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.meta.json'))
    const metas = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(this.dir, f), 'utf8')) as RoomMeta)
    )
    return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async create(name: string): Promise<RoomMeta> {
    const id = `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const meta: RoomMeta = { id, name, createdAt: new Date().toISOString() }
    await writeFile(join(this.dir, `${id}.meta.json`), JSON.stringify(meta, null, 2))
    return meta
  }

  async meta(id: string): Promise<RoomMeta | null> {
    if (!ROOM_ID.test(id)) return null
    try {
      return JSON.parse(await readFile(join(this.dir, `${id}.meta.json`), 'utf8')) as RoomMeta
    } catch {
      return null
    }
  }

  /** ルームを開く(メタが無い id は開かない)。メモリ上に無ければファイルから読む */
  async get(id: string): Promise<Room | null> {
    const existing = this.live.get(id)
    if (existing) return existing
    if (!(await this.meta(id))) return null
    const room = new Room(id, join(this.dir, `${id}.yjs`))
    await room.load()
    this.live.set(id, room)
    console.log(`[room] open ${id}`)
    return room
  }

  /** ボード上の依頼カードを平坦なレコードにして返す */
  async listRequests(id: string): Promise<RequestRecord[] | null> {
    const meta = await this.meta(id)
    const room = meta && (await this.get(id))
    if (!meta || !room) return null
    return room
      .listShapes()
      .filter((s): s is Extract<Shape, { type: 'request-card' }> => s.type === 'request-card')
      .map((s) => toRequestRecord(s, meta.name))
  }

  /** kintone レコード番号をカードに書き戻す(全接続者に同期される) */
  async setKintoneIds(id: string, ids: Record<string, string>): Promise<void> {
    const room = await this.get(id)
    if (!room) return
    room.doc.transact(() => {
      for (const [shapeId, recordId] of Object.entries(ids)) {
        const m = room.shapes.get(shapeId)
        if (!m || m.get('type') !== 'request-card') continue
        if (m.get('kintoneRecordId') !== recordId) m.set('kintoneRecordId', recordId)
      }
    }, 'server')
  }

  async closeAll(): Promise<void> {
    for (const r of this.live.values()) {
      await r.persist()
      r.destroy()
    }
    this.live.clear()
  }
}
