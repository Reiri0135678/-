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
