import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { listRooms } from '../api'
import { getUserName } from '../user'
import type { Editor } from 'tldraw'
import { Board } from '../canvas/Board'
import { RequestPanel } from '../panel/RequestPanel'

export function BoardPage({ roomId }: { roomId: string }): JSX.Element {
  const userName = getUserName()
  const [title, setTitle] = useState(roomId)
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline' | 'error'>('connecting')
  const [peers, setPeers] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)

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
        {editor ? <RequestPanel editor={editor} /> : <p className="muted">読み込み中…</p>}
      </aside>
      <main className="app__board">
        <Board
          roomId={roomId}
          userName={userName}
          demo={demo}
          onStatus={setStatus}
          onPeers={setPeers}
          onEditor={setEditor}
        />
      </main>
    </div>
  )
}
