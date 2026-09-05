import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WebSocket } from 'ws'
import { appendFile } from 'node:fs/promises'
import { rotateLog, rotatedName } from './maintenance'
import {
  CARD_H,
  CARD_W,
  CLOSED_STATUSES,
  defaultsFor,
  type VersionInfo,
  normalizeShape,
  toRequestRecord,
  type HistoryEntry,
  type RequestCardShape,
  type RequestRecord,
  type Shape
} from '../../shared/shapes'

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

/** サーバー起点の変更の origin。誰の操作かを履歴に残すため名前を含める */
interface ServerOrigin {
  server: true
  user: string
}
const isConn = (o: unknown): o is Conn => !!o && typeof o === 'object' && 'controlled' in (o as object)
const isServerOrigin = (o: unknown): o is ServerOrigin => !!o && typeof o === 'object' && (o as ServerOrigin).server === true

/**
 * 1 ボード = 1 Y.Doc。接続ごとに y-websocket 互換プロトコルで同期する。
 * 閲覧のみ(readonly)の接続からの更新は無視する(サーバー側で権限を強制)。
 * 永続化: 変更の 1 秒後、または最後の接続が切れた時に data/rooms/<id>.yjs へバイナリ更新を保存。
 */
export class Room {
  readonly doc = new Y.Doc()
  readonly awareness = new awarenessProtocol.Awareness(this.doc)
  readonly conns = new Set<Conn>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    readonly id: string,
    private readonly file: string,
    private readonly logFile: string,
    private readonly nextNumber: () => Promise<string>,
    private readonly onHistory: (entries: HistoryEntry[]) => void
  ) {
    this.awareness.setLocalState(null)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MSG_SYNC)
      syncProtocol.writeUpdate(enc, update)
      this.broadcast(encoding.toUint8Array(enc), origin)
      this.schedulePersist()
      if (origin !== 'load') void this.assignNumbers()
    })
    // 変更履歴: 誰が(接続ユーザー)いつ何を変えたかを追記型ログに残す
    this.shapes.observeDeep((events, txn) => {
      if (txn.origin === 'load') return
      const user = isConn(txn.origin) ? txn.origin.user : isServerOrigin(txn.origin) ? txn.origin.user : 'server'
      const entries: HistoryEntry[] = []
      const ts = Date.now()
      for (const ev of events) {
        if (ev.target === this.shapes) {
          ev.changes.keys.forEach((change, shapeId) => {
            if (change.action === 'add') {
              const m = this.shapes.get(shapeId)
              const json = (m?.toJSON() ?? {}) as Record<string, unknown>
              entries.push({ ts, user, shapeId, shapeType: json['type'] as Shape['type'], action: 'create', fields: json, no: json['no'] as string | undefined })
            } else if (change.action === 'delete') {
              const old = change.oldValue as Y.Map<unknown> | undefined
              const json = (old && typeof old.toJSON === 'function' ? old.toJSON() : {}) as Record<string, unknown>
              entries.push({ ts, user, shapeId, shapeType: json['type'] as Shape['type'], action: 'delete', fields: {}, no: json['no'] as string | undefined })
            }
          })
        } else if (ev.target instanceof Y.Map && ev.target.parent === this.shapes) {
          const m = ev.target as Y.Map<unknown>
          const shapeId = [...this.shapes.entries()].find(([, v]) => v === m)?.[0]
          if (!shapeId) continue
          const fields: Record<string, unknown> = {}
          ev.changes.keys.forEach((_c, key) => {
            if (key === 'updatedAt' || key === 'by') return
            fields[key] = m.get(key)
          })
          if (Object.keys(fields).length === 0) continue
          entries.push({ ts, user, shapeId, shapeType: m.get('type') as Shape['type'], action: 'update', fields, no: m.get('no') as string | undefined })
        }
      }
      if (entries.length) {
        void this.appendLog(entries)
        this.onHistory(entries)
      }
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

  private numbering = false
  private numberingRequested = false
  /** 受付番号が空の依頼カードに採番する(作成経路を問わずサーバーが付ける)。実行中に来た依頼も取りこぼさない */
  private async assignNumbers(): Promise<void> {
    this.numberingRequested = true
    if (this.numbering) return
    this.numbering = true
    try {
      while (this.numberingRequested) {
        this.numberingRequested = false
        const pending: string[] = []
        this.shapes.forEach((m, id) => {
          if (m.get('type') === 'request-card' && !m.get('no')) pending.push(id)
        })
        for (const id of pending) {
          const no = await this.nextNumber()
          const m = this.shapes.get(id)
          if (m && !m.get('no')) this.doc.transact(() => m.set('no', no), { server: true, user: 'system' } satisfies ServerOrigin)
        }
      }
    } finally {
      this.numbering = false
    }
  }

  private logQueue: Promise<void> = Promise.resolve()
  private logWrites = 0
  static LOG_MAX_BYTES = 5 * 1024 * 1024
  static LOG_GENERATIONS = 5
  private appendLog(entries: HistoryEntry[]): Promise<void> {
    const text = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    this.logQueue = this.logQueue
      .then(async () => {
        await appendFile(this.logFile, text)
        // 100 回に 1 回だけサイズを確認してローテーション
        if (++this.logWrites % 100 === 0) await rotateLog(this.logFile, Room.LOG_MAX_BYTES, Room.LOG_GENERATIONS)
      })
      .catch((err) => console.error('[room] log failed', err))
    return this.logQueue
  }

  /** 履歴を新しい順に返す。ローテーション済みの世代も遡って読む */
  async history(shapeId?: string, limit = 200): Promise<HistoryEntry[]> {
    await this.logQueue
    const out: HistoryEntry[] = []
    const files = [this.logFile, ...Array.from({ length: Room.LOG_GENERATIONS }, (_, i) => rotatedName(this.logFile, i + 1))]
    for (const f of files) {
      if (out.length >= limit) break
      if (!existsSync(f)) continue
      const lines = (await readFile(f, 'utf8')).split('\n').filter(Boolean)
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        try {
          const e = JSON.parse(lines[i]!) as HistoryEntry
          if (!shapeId || e.shapeId === shapeId) out.push(e)
        } catch {
          /* 壊れた行は飛ばす */
        }
      }
    }
    return out
  }

  /** 完了・取消のまま days 日以上経ったカードをアーカイブする。返り値は件数 */
  autoArchive(days: number): number {
    const limit = Date.now() - days * 86400_000
    const targets: string[] = []
    this.shapes.forEach((m, id) => {
      if (m.get('type') !== 'request-card' || m.get('archived')) return
      if (!CLOSED_STATUSES.includes(m.get('status') as never)) return
      if (Number(m.get('updatedAt') ?? 0) < limit) targets.push(id)
    })
    if (targets.length) {
      this.doc.transact(() => {
        for (const id of targets) this.shapes.get(id)?.set('archived', true)
      }, { server: true, user: 'system' } satisfies ServerOrigin)
    }
    return targets.length
  }

  // ---- 版(スナップショット): 名前を付けて保存し、後で復元できる ----------------
  private get snapDir(): string {
    return this.file.replace(/\.yjs$/, '.versions')
  }
  async listVersions(): Promise<VersionInfo[]> {
    if (!existsSync(this.snapDir)) return []
    const files = (await readdir(this.snapDir)).filter((f) => f.endsWith('.json'))
    const list = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(this.snapDir, f), 'utf8')) as VersionInfo))
    return list.sort((a, b) => b.ts - a.ts)
  }
  async saveVersion(name: string, by: string): Promise<VersionInfo> {
    await mkdir(this.snapDir, { recursive: true })
    const id = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const info: VersionInfo = { id, name: name || new Date().toLocaleString('ja-JP'), by, ts: Date.now(), shapes: this.shapes.size }
    await writeFile(join(this.snapDir, `${id}.yjs`), Y.encodeStateAsUpdate(this.doc))
    await writeFile(join(this.snapDir, `${id}.json`), JSON.stringify(info))
    return info
  }
  /** 版の内容で図形・ページ・コメントを置き換える(全接続者に同期される) */
  async restoreVersion(id: string, by: string): Promise<boolean> {
    const file = join(this.snapDir, `${id}.yjs`)
    if (!/^v_[a-z0-9]+$/.test(id) || !existsSync(file)) return false
    const tmp = new Y.Doc()
    Y.applyUpdate(tmp, new Uint8Array(await readFile(file)))
    const src = {
      shapes: tmp.getMap('shapes').toJSON() as Record<string, Record<string, unknown>>,
      pages: tmp.getMap('pages').toJSON() as Record<string, unknown>,
      comments: tmp.getMap('comments').toJSON() as Record<string, Record<string, unknown>>
    }
    this.doc.transact(() => {
      for (const [name, data] of [['shapes', src.shapes], ['comments', src.comments]] as const) {
        const map = this.doc.getMap(name) as Y.Map<Y.Map<unknown>>
        for (const k of [...map.keys()]) map.delete(k)
        for (const [k, v] of Object.entries(data)) {
          const m = new Y.Map<unknown>()
          for (const [kk, vv] of Object.entries(v)) m.set(kk, vv)
          map.set(k, m)
        }
      }
      const pages = this.doc.getMap('pages')
      for (const k of [...pages.keys()]) pages.delete(k)
      for (const [k, v] of Object.entries(src.pages)) pages.set(k, v)
    }, { server: true, user: by } satisfies ServerOrigin)
    tmp.destroy()
    return true
  }
  async deleteVersion(id: string): Promise<boolean> {
    if (!/^v_[a-z0-9]+$/.test(id)) return false
    const { rm } = await import('node:fs/promises')
    await rm(join(this.snapDir, `${id}.yjs`), { force: true })
    await rm(join(this.snapDir, `${id}.json`), { force: true })
    return true
  }

  getCard(shapeId: string): RequestCardShape | null {
    const m = this.shapes.get(shapeId)
    if (!m || m.get('type') !== 'request-card') return null
    const s = normalizeShape(m.toJSON() as Record<string, unknown>)
    return s && s.type === 'request-card' ? s : null
  }

  /** サーバー側で図形を作る(依頼フォームなど)。z は最前面 */
  putShape(shape: Shape, user: string): void {
    this.doc.transact(() => {
      const m = new Y.Map<unknown>()
      for (const [k, v] of Object.entries(shape)) m.set(k, v)
      this.shapes.set(shape.id, m)
    }, { server: true, user } satisfies ServerOrigin)
  }

  maxZ(): number {
    let z = 0
    this.shapes.forEach((m) => (z = Math.max(z, Number(m.get('z') ?? 0))))
    return z
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
  private counter: Record<string, number> = {}
  private counterQueue: Promise<unknown> = Promise.resolve()
  /** 履歴が追記されたときに呼ばれる(通知用) */
  onHistory: ((roomId: string, entries: HistoryEntry[], room: Room) => void) | null = null

  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    try {
      this.counter = JSON.parse(await readFile(this.counterPath(), 'utf8'))
    } catch {
      this.counter = {}
    }
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
    const room = new Room(
      id,
      join(this.dir, `${id}.yjs`),
      join(this.dir, `${id}.log.jsonl`),
      () => this.nextNumber(),
      (entries) => this.onHistory?.(id, entries, room)
    )
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
  async setKintoneIds(id: string, ids: Record<string, string>, user = 'kintone'): Promise<void> {
    const room = await this.get(id)
    if (!room) return
    room.doc.transact(() => {
      for (const [shapeId, recordId] of Object.entries(ids)) {
        const m = room.shapes.get(shapeId)
        if (!m || m.get('type') !== 'request-card') continue
        if (m.get('kintoneRecordId') !== recordId) m.set('kintoneRecordId', recordId)
      }
    }, { server: true, user } satisfies ServerOrigin)
  }

  private counterPath(): string {
    return join(this.dir, 'counter.json')
  }

  /** 受付番号 QC-YYYY-NNNN を年ごとに連番で採番(直列化してファイルに書き込む) */
  nextNumber(): Promise<string> {
    const p = this.counterQueue.then(async () => {
      const year = String(new Date().getFullYear())
      const n = (this.counter[year] ?? 0) + 1
      this.counter[year] = n
      await writeFile(this.counterPath(), JSON.stringify(this.counter))
      return `QC-${year}-${String(n).padStart(4, '0')}`
    })
    this.counterQueue = p.catch(() => undefined)
    return p
  }

  async history(id: string, shapeId?: string): Promise<HistoryEntry[] | null> {
    const room = await this.get(id)
    return room ? room.history(shapeId) : null
  }

  /**
   * 依頼フォームからの投入: カードを空いている場所に置き、添付画像を横に並べて紐付ける。
   * 位置は「受付グリッド」(左上から 4 列)に順に置く。
   */
  async createRequest(
    id: string,
    user: string,
    input: Partial<RequestCardShape>,
    images: Array<{ src: string; name: string; w: number; h: number }>
  ): Promise<RequestCardShape | null> {
    const room = await this.get(id)
    if (!room) return null
    const cards = room.listShapes().filter((s) => s.type === 'request-card' && !(s as RequestCardShape).archived)
    const index = cards.length
    const col = index % 4
    const row = Math.floor(index / 4)
    const x = 40 + col * (CARD_W + 30)
    const y = 40 + row * (CARD_H + 30)
    let z = room.maxZ() + 1
    const now = Date.now()
    const linkedShapeIds: string[] = []
    let ix = 40 + 4 * (CARD_W + 30) + 40
    for (const img of images) {
      const k = Math.min(1, 300 / Math.max(img.w, img.h, 1))
      const shape: Shape = {
        ...defaultsFor('image'),
        id: `s_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        x: ix,
        y,
        w: Math.round(img.w * k),
        h: Math.round(img.h * k),
        z: z++,
        by: user,
        updatedAt: now,
        src: img.src,
        name: img.name
      } as Shape
      room.putShape(shape, user)
      linkedShapeIds.push(shape.id)
      ix += shape.w + 20
    }
    const card: RequestCardShape = {
      ...defaultsFor('request-card'),
      ...input,
      type: 'request-card',
      id: `s_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      x,
      y,
      z: z++,
      by: user,
      updatedAt: now,
      requester: input.requester || user,
      requestedAt: input.requestedAt || new Date().toISOString().slice(0, 10),
      linkedShapeIds,
      no: '',
      kintoneRecordId: '',
      archived: false
    } as RequestCardShape
    room.putShape(card, user)
    // 採番を待って番号付きで返す
    for (let i = 0; i < 50; i++) {
      const no = room.shapes.get(card.id)?.get('no') as string | undefined
      if (no) return { ...card, no }
      await new Promise((r) => setTimeout(r, 20))
    }
    return card
  }

  /** 全ボードの自動アーカイブ。返り値は合計件数 */
  async autoArchiveAll(days: number): Promise<number> {
    let n = 0
    for (const meta of await this.list()) {
      const room = await this.get(meta.id)
      if (room) n += room.autoArchive(days)
    }
    return n
  }

  async closeAll(): Promise<void> {
    for (const r of this.live.values()) {
      await r.persist()
      r.destroy()
    }
    this.live.clear()
  }
}
