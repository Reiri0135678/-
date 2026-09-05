import { TLSocketRoom, type RoomSnapshot } from '@tldraw/sync-core'
import type { TLRecord } from '@tldraw/tlschema'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createQcSchema } from '../../shared/schema'
import { toRequestRecord, type RequestCardProps, type RequestRecord } from '../../shared/request-card'

export interface RoomMeta {
  id: string
  name: string
  createdAt: string
}

const DEFAULT_ROOMS = ['品質管理室', '製造1課', '製造2課']
const PERSIST_DELAY_MS = 1000
const ROOM_ID = /^[A-Za-z0-9_-]{1,40}$/

type QcRoom = TLSocketRoom<TLRecord>

interface LiveRoom {
  room: QcRoom
  timer: NodeJS.Timeout | null
}

/**
 * ボード(ルーム)の生成・読込・永続化を担当。
 * 1ボード = 1 TLSocketRoom。スナップショットは JSON でファイル保存(後段で DB / kintone へ差し替え可能)。
 */
export class RoomManager {
  private readonly live = new Map<string, LiveRoom>()
  private readonly schema = createQcSchema()

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
    await writeFile(this.metaPath(id), JSON.stringify(meta, null, 2))
    return meta
  }

  async get(id: string): Promise<QcRoom | null> {
    if (!ROOM_ID.test(id)) return null
    const existing = this.live.get(id)
    if (existing) return existing.room

    // メタが無いルームは開かない(URL 直打ちで無限にルームが増えるのを防ぐ)
    try {
      await readFile(this.metaPath(id), 'utf8')
    } catch {
      return null
    }

    let initialSnapshot: RoomSnapshot | undefined
    try {
      initialSnapshot = JSON.parse(await readFile(this.snapshotPath(id), 'utf8'))
    } catch {
      initialSnapshot = undefined
    }

    const entry: LiveRoom = { room: null as unknown as QcRoom, timer: null }
    entry.room = new TLSocketRoom<TLRecord>({
      schema: this.schema,
      initialSnapshot,
      onDataChange: () => this.schedulePersist(id, entry),
      onSessionRemoved: (room, { numSessionsRemaining }) => {
        if (numSessionsRemaining > 0) return
        // 最後の人が抜けたら保存してメモリから解放
        this.persist(id, entry).finally(() => {
          room.close()
          this.live.delete(id)
        })
      }
    })
    this.live.set(id, entry)
    console.log(`[room] open ${id}`)
    return entry.room
  }

  private schedulePersist(id: string, entry: LiveRoom): void {
    if (entry.timer) return
    entry.timer = setTimeout(() => {
      entry.timer = null
      void this.persist(id, entry)
    }, PERSIST_DELAY_MS)
  }

  private async persist(id: string, entry: LiveRoom): Promise<void> {
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    try {
      const snapshot = entry.room.getCurrentSnapshot()
      await writeFile(this.snapshotPath(id), JSON.stringify(snapshot))
    } catch (err) {
      console.error(`[room] persist failed ${id}`, err)
    }
  }

  async meta(id: string): Promise<RoomMeta | null> {
    if (!ROOM_ID.test(id)) return null
    try {
      return JSON.parse(await readFile(this.metaPath(id), 'utf8')) as RoomMeta
    } catch {
      return null
    }
  }

  /** ボード上の依頼カードを平坦なレコードにして返す */
  async listRequests(id: string): Promise<RequestRecord[] | null> {
    const meta = await this.meta(id)
    const room = meta && (await this.get(id))
    if (!meta || !room) return null
    const snap = room.getCurrentSnapshot()
    return snap.documents
      .map((d) => d.state as { typeName: string; type?: string; id: string; props?: RequestCardProps })
      .filter((r) => r.typeName === 'shape' && r.type === 'request-card' && r.props)
      .map((r) => toRequestRecord({ id: r.id, props: r.props! }, meta.name))
  }

  /** kintone レコード番号をカードに書き戻す(全接続者に同期される) */
  async setKintoneIds(id: string, ids: Record<string, string>): Promise<void> {
    const room = await this.get(id)
    if (!room) return
    await room.updateStore((store) => {
      for (const [shapeId, recordId] of Object.entries(ids)) {
        const rec = store.get(shapeId) as (TLRecord & { props?: RequestCardProps }) | null
        if (!rec || rec.typeName !== 'shape' || !rec.props) continue
        if (rec.props.kintoneRecordId === recordId) continue
        store.put({ ...rec, props: { ...rec.props, kintoneRecordId: recordId } } as TLRecord)
      }
    })
  }

  private metaPath(id: string): string {
    return join(this.dir, `${id}.meta.json`)
  }
  private snapshotPath(id: string): string {
    return join(this.dir, `${id}.snapshot.json`)
  }
}
