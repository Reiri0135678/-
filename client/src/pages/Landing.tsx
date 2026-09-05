import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { authMode, createRoom, listRooms, login, logout, me, type Me, type RoomMeta } from '../api'
import { getUserName, setUserName } from '../user'

export function Landing(): JSX.Element {
  const [mode, setMode] = useState<'open' | 'password' | null>(null)
  const [user, setUser] = useState<Me | null>(null)
  const [name, setName] = useState(getUserName)
  const [password, setPassword] = useState('')
  const [rooms, setRooms] = useState<RoomMeta[]>([])
  const [newRoom, setNewRoom] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    authMode().then(setMode).catch((e) => setError(String(e)))
    me()
      .then((u) => {
        setUser(u)
        if (u) setName(u.name)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!user) return
    listRooms().then(setRooms).catch((e) => setError(String(e)))
  }, [user])

  const doLogin = async () => {
    setError('')
    try {
      const u = await login(name, mode === 'password' ? password : undefined)
      setUserName(u.name)
      setUser(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const doLogout = async () => {
    await logout()
    setUser(null)
    setRooms([])
    setPassword('')
  }

  const create = async () => {
    const n = newRoom.trim()
    if (!n) return
    try {
      const meta = await createRoom(n)
      setRooms((r) => [...r, meta])
      setNewRoom('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const canWrite = user?.role !== 'viewer'

  return (
    <div className="landing">
      <div className="landing__card">
        <h1>QC Board</h1>
        <p className="landing__lead">検査依頼ボード。{user ? 'ボードを選んでください。' : 'ログインしてください。'}</p>
        {error && <p className="error">{error}</p>}

        {!user ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              doLogin()
            }}
          >
            <label className="field">
              <span>名前</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田" autoFocus />
            </label>
            {mode === 'password' && (
              <label className="field">
                <span>パスワード</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <button className="btn btn--primary btn--lg" type="submit" disabled={!name.trim() || mode === null}>
              {mode === 'password' ? 'ログイン' : '入る'}
            </button>
            {mode === 'open' && (
              <p className="muted">パスワード無しのオープンモードです。config/users.json を作るとログイン必須になります。</p>
            )}
          </form>
        ) : (
          <>
            <div className="who">
              <span>
                <b>{user.name}</b> <span className="role">{roleLabel(user.role)}</span>
              </span>
              <button className="link" onClick={doLogout}>
                ログアウト
              </button>
            </div>
            <h2>ボード</h2>
            <ul className="rooms">
              {rooms.map((r) => (
                <li key={r.id}>
                  <button onClick={() => navigate(`/b/${encodeURIComponent(r.id)}`)}>{r.name}</button>
                </li>
              ))}
            </ul>
            {canWrite && (
              <div className="field field--row">
                <input
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="新しいボード名"
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                />
                <button className="btn" onClick={create} disabled={!newRoom.trim()}>
                  作成
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function roleLabel(role: Me['role']): string {
  return role === 'admin' ? '管理者' : role === 'viewer' ? '閲覧のみ' : 'メンバー'
}
