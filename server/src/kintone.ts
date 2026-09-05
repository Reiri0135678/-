import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { RequestRecord } from '../../shared/shapes'

/**
 * kintone 連携。
 * 設定: config/kintone.json(環境変数 QC_KINTONE_CONFIG で変更可)。例は config/kintone.example.json
 * 動作: ボード上の依頼カードを kintone アプリのレコードとして作成/更新(shapeId を外部キーに使う)
 * モック: 環境変数 KINTONE_MOCK=1 で kintone に接続せずメモリ上で同じ振る舞いをする(テスト用)
 */
export interface KintoneConfig {
  baseUrl: string
  appId: string
  apiToken: string
  /** RequestRecord のキー → kintone フィールドコード */
  fields: Partial<Record<keyof RequestRecord, string>>
}

export interface SyncResult {
  created: number
  updated: number
  /** shapeId → kintone レコード番号 */
  ids: Record<string, string>
}

interface Adapter {
  findExisting(shapeIds: string[]): Promise<Map<string, string>>
  create(records: RequestRecord[]): Promise<string[]>
  update(records: Array<{ id: string; record: RequestRecord }>): Promise<void>
}

const CHUNK = 100

export class Kintone {
  private config: KintoneConfig | null = null
  private mock: MockAdapter | null = null

  constructor(private readonly configFile: string, mock: boolean) {
    if (mock) this.mock = new MockAdapter()
  }

  async init(): Promise<void> {
    if (!existsSync(this.configFile)) return
    try {
      const c = JSON.parse(await readFile(this.configFile, 'utf8')) as KintoneConfig
      if (!c.baseUrl || !c.appId || !c.apiToken || !c.fields?.shapeId) {
        console.error('[kintone] 設定に baseUrl / appId / apiToken / fields.shapeId が必要です')
        return
      }
      this.config = c
    } catch (err) {
      console.error('[kintone] 設定の読込に失敗', err)
    }
  }

  status(): { mode: 'mock' | 'configured' | 'unconfigured'; baseUrl?: string; appId?: string } {
    if (this.mock) return { mode: 'mock' }
    if (this.config) return { mode: 'configured', baseUrl: this.config.baseUrl, appId: this.config.appId }
    return { mode: 'unconfigured' }
  }

  async sync(records: RequestRecord[]): Promise<SyncResult> {
    const adapter: Adapter | null = this.mock ?? (this.config ? new RestAdapter(this.config) : null)
    if (!adapter) throw new Error('kintone が設定されていません(config/kintone.json)')

    const existing = await adapter.findExisting(records.map((r) => r.shapeId))
    const toCreate = records.filter((r) => !existing.has(r.shapeId))
    const toUpdate = records
      .filter((r) => existing.has(r.shapeId))
      .map((r) => ({ id: existing.get(r.shapeId)!, record: r }))

    const ids: Record<string, string> = {}
    for (const [shapeId, id] of existing) ids[shapeId] = id

    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK)
      const created = await adapter.create(chunk)
      chunk.forEach((r, j) => (ids[r.shapeId] = created[j]!))
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await adapter.update(toUpdate.slice(i, i + CHUNK))
    }
    return { created: toCreate.length, updated: toUpdate.length, ids }
  }
}

// ---- kintone REST API ---------------------------------------------------
class RestAdapter implements Adapter {
  constructor(private readonly c: KintoneConfig) {}

  private async call(method: 'GET' | 'POST' | 'PUT', body: unknown): Promise<any> {
    const url = `${this.c.baseUrl.replace(/\/$/, '')}/k/v1/records.json`
    const res = await fetch(url, {
      method,
      headers: {
        'X-Cybozu-API-Token': this.c.apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`kintone ${method} ${res.status}: ${json.message ?? JSON.stringify(json)}`)
    return json
  }

  private toFields(r: RequestRecord): Record<string, { value: string }> {
    const out: Record<string, { value: string }> = {}
    for (const [key, code] of Object.entries(this.c.fields) as Array<[keyof RequestRecord, string]>) {
      if (!code || key === 'kintoneRecordId') continue
      const v = r[key]
      // 日付フィールドに空文字は送れないので省く
      if (key === 'requestedAt' && !v) continue
      out[code] = { value: String(v ?? '') }
    }
    return out
  }

  async findExisting(shapeIds: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>()
    const code = this.c.fields.shapeId!
    for (let i = 0; i < shapeIds.length; i += CHUNK) {
      const chunk = shapeIds.slice(i, i + CHUNK)
      const query = `${code} in (${chunk.map((s) => `"${s.replace(/"/g, '')}"`).join(',')}) limit 500`
      // GET はクエリ文字列。X-HTTP-Method-Override で POST ボディに載せる(URL 長対策)
      const json = await this.callGet({ app: this.c.appId, query, fields: ['$id', code] })
      for (const rec of json.records ?? []) {
        found.set(rec[code].value, rec.$id.value)
      }
    }
    return found
  }

  private async callGet(body: unknown): Promise<any> {
    const url = `${this.c.baseUrl.replace(/\/$/, '')}/k/v1/records.json`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Cybozu-API-Token': this.c.apiToken,
        'X-HTTP-Method-Override': 'GET',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`kintone GET ${res.status}: ${json.message ?? JSON.stringify(json)}`)
    return json
  }

  async create(records: RequestRecord[]): Promise<string[]> {
    const json = await this.call('POST', { app: this.c.appId, records: records.map((r) => this.toFields(r)) })
    return (json.ids as string[]) ?? []
  }

  async update(records: Array<{ id: string; record: RequestRecord }>): Promise<void> {
    await this.call('PUT', {
      app: this.c.appId,
      records: records.map(({ id, record }) => ({ id, record: this.toFields(record) }))
    })
  }
}

// ---- モック(テスト・デモ用) -------------------------------------------
class MockAdapter implements Adapter {
  private seq = 1000
  readonly store = new Map<string, { id: string; record: RequestRecord }>()

  async findExisting(shapeIds: string[]): Promise<Map<string, string>> {
    const m = new Map<string, string>()
    for (const s of shapeIds) {
      const hit = this.store.get(s)
      if (hit) m.set(s, hit.id)
    }
    return m
  }
  async create(records: RequestRecord[]): Promise<string[]> {
    return records.map((r) => {
      const id = String(++this.seq)
      this.store.set(r.shapeId, { id, record: r })
      return id
    })
  }
  async update(records: Array<{ id: string; record: RequestRecord }>): Promise<void> {
    for (const { id, record } of records) this.store.set(record.shapeId, { id, record })
  }
}
