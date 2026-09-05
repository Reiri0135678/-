import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { listRooms } from '../api'
import { getUserName } from '../user'
import { Board } from '../canvas/Board'

export function BoardPage({ roomId }: { roomId: string }): JSX.Element {
  const userName = getUserName()
  const [title, setTitle] = useState(roomId)
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline' | 'error'>('connecting')
  const [peers, setPeers] = useState(0)

  useEffect(() => {
    if (!userName) navigate('/')
  }, [userName])

  useEffect(() => {
    listRooms()
      .then((rooms) => setTitle(rooms.find((r) => r.id === roomId)?.name ?? roomId))
      .catch(() => undefined)
  }, [roomId])

  const demo = new URLSearchParams(window.location.search).get('demo') === '1'

  return (
    <div className="app">
      <header className="app__header">
        <button className="link" onClick={() => navigate('/')}>
          ← ボード一覧
        </button>
        <span className="app__title">{title}</span>
        <span className="app__meta">
          <span className={`dot dot--${status}`} />
          {status === 'online' ? `接続中 · 他 ${peers} 人` : status === 'connecting' ? '接続中…' : '切断'}
          {' · '}
          {userName}
        </span>
      </header>
      <aside className="app__sidebar">
        <h2>依頼リスト(予定)</h2>
        <p>ここに検査依頼のスプレッドシート式リストと画像一覧を配置予定。</p>
        <p>キャンバス上の「依頼カード」と双方向に連動させる想定。</p>
      </aside>
      <main className="app__board">
        <Board
          roomId={roomId}
          userName={userName}
          demo={demo}
          onStatus={setStatus}
          onPeers={setPeers}
        />
      </main>
    </div>
  )
}
