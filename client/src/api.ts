export interface RoomMeta {
  id: string
  name: string
  createdAt: string
}

export async function listRooms(): Promise<RoomMeta[]> {
  const r = await fetch('/api/rooms')
  if (!r.ok) throw new Error(`rooms: ${r.status}`)
  return r.json()
}

export async function createRoom(name: string): Promise<RoomMeta> {
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!r.ok) throw new Error(`create: ${r.status}`)
  return r.json()
}

export function syncUri(roomId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api/connect/${encodeURIComponent(roomId)}`
}

// ---- 認証 ---------------------------------------------------------------
export type Role = 'admin' | 'member' | 'viewer'
export interface Me {
  name: string
  role: Role
}

async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `${r.status}`)
  return body as T
}

export async function authMode(): Promise<'open' | 'password'> {
  return (await json<{ mode: 'open' | 'password' }>(await fetch('/api/auth/mode'))).mode
}

export async function login(name: string, password?: string): Promise<Me> {
  return json(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, password })
    })
  )
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function me(): Promise<Me | null> {
  const r = await fetch('/api/auth/me')
  if (r.status === 401) return null
  return json(r)
}

// ---- kintone ------------------------------------------------------------
export interface KintoneStatus {
  mode: 'mock' | 'configured' | 'unconfigured'
  baseUrl?: string
  appId?: string
}
export async function kintoneStatus(): Promise<KintoneStatus> {
  return json(await fetch('/api/kintone/status'))
}
export async function kintoneSync(roomId: string): Promise<{ created: number; updated: number; total: number }> {
  return json(await fetch(`/api/rooms/${encodeURIComponent(roomId)}/kintone/sync`, { method: 'POST' }))
}

/** 埋め込み用ワンタイムトークンをセッションに交換する */
export async function redeemToken(token: string): Promise<Me> {
  return json(
    await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    })
  )
}

// ---- 依頼フォーム・履歴 -------------------------------------------------
export interface RequestInput {
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  note: string
  dueDate: string
  priority: '通常' | '至急'
  requester?: string
  images: Array<{ id: string; name: string; w: number; h: number }>
}

export async function submitRequest(roomId: string, input: RequestInput): Promise<{ id: string; no: string }> {
  return json(
    await fetch(`/api/rooms/${encodeURIComponent(roomId)}/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
  )
}

/** 画像をアップロードして id を返す(依頼フォーム・キャンバス共通) */
export async function uploadImage(file: File): Promise<{ id: string; src: string }> {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const id = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${ext}`.replace(/[^A-Za-z0-9_.-]/g, '_')
  const r = await fetch(`/api/uploads/${id}`, { method: 'PUT', body: file })
  if (!r.ok) throw new Error(`upload failed: ${r.status}`)
  return { id, src: `/api/uploads/${id}` }
}

export interface HistoryEntry {
  ts: number
  user: string
  shapeId: string
  shapeType: string
  action: 'create' | 'update' | 'delete'
  fields: Record<string, unknown>
  no?: string
}

export async function fetchHistory(roomId: string, shapeId?: string): Promise<HistoryEntry[]> {
  const q = shapeId ? `?shapeId=${encodeURIComponent(shapeId)}` : ''
  return json(await fetch(`/api/rooms/${encodeURIComponent(roomId)}/history${q}`))
}
