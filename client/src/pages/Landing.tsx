import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { createRoom, listRooms, type RoomMeta } from '../api'
import { getUserName, setUserName } from '../user'

export function Landing(): JSX.Element {
  const [name, setName] = useState(getUserName)
  const [rooms, setRooms] = useState<RoomMeta[]>([])
  const [newRoom, setNewRoom] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listRooms().then(setRooms).catch((e) => setError(String(e)))
  }, [])

  const canEnter = name.trim().length > 0

  const enter = (id: string) => {
    if (!canEnter) return
    setUserName(name)
    navigate(`/b/${encodeURIComponent(id)}`)
  }

  const create = async () => {
    const n = newRoom.trim()
    if (!n) return
    try {
      const meta = await createRoom(n)
      setRooms((r) => [...r, meta])
      setNewRoom('')
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="landing">
      <div className="landing__card">
        <h1>QC Board</h1>
        <p className="landing__lead">検査依頼ボード。名前を入力してボードを選んでください。</p>

        <label className="field">
          <span>あなたの名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田"
            autoFocus
          />
        </label>

        <h2>ボード</h2>
        {error && <p className="error">{error}</p>}
        <ul className="rooms">
          {rooms.map((r) => (
            <li key={r.id}>
              <button disabled={!canEnter} onClick={() => enter(r.id)}>
                {r.name}
              </button>
            </li>
          ))}
        </ul>

        <div className="field field--row">
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="新しいボード名"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button onClick={create} disabled={!newRoom.trim()}>
            作成
          </button>
        </div>
      </div>
    </div>
  )
}
