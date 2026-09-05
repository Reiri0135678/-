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
