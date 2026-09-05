import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { BoardEditor as Editor } from '../canvas/editor'
import { navigate } from '../App'
import { listRooms, me, type Me } from '../api'
import { Board, type BoardStatus } from '../canvas/Board'
import { Sidebar } from '../panel/Sidebar'
import { RequestSheet } from '../panel/RequestSheet'
import { roleLabel } from './Landing'
import { isEmbed, notifyHost } from '../embed'
import { useSingleSelection } from '../panel/useCards'

const DRAWER_KEY = 'qc.drawerOpen'

export function BoardPage({ roomId }: { roomId: string }): JSX.Element {
  const [user, setUser] = useState<Me | null | undefined>(undefined)
  const [title, setTitle] = useState(roomId)
  const [status, setStatus] = useState<BoardStatus>('connecting')
  const [peers, setPeers] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try {
      return localStorage.getItem(DRAWER_KEY) !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    me()
      .then((u) => {
        if (!u) navigate('/')
        else setUser(u)
      })
      .catch(() => navigate('/'))
  }, [])

  useEffect(() => {
    if (!user) return
    listRooms()
      .then((rooms) => setTitle(rooms.find((r) => r.id === roomId)?.name ?? roomId))
      .catch(() => undefined)
  }, [roomId, user])

  const toggleDrawer = () => {
    setDrawerOpen((v) => {
      try {
        localStorage.setItem(DRAWER_KEY, v ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !v
    })
  }

  useEffect(() => {
    if (user) notifyHost({ event: 'board-opened', roomId, title })
  }, [user, roomId, title])

  if (!user) return <p className="muted center">読み込み中…</p>

  const demo = new URLSearchParams(window.location.search).get('demo') === '1'
  const readonly = user.role === 'viewer'

  return (
    <div className="app" data-drawer={drawerOpen} data-embed={isEmbed()}>
      {editor && <SelectionNotifier editor={editor} roomId={roomId} />}
      <header className="app__header">
        <button className="link" onClick={() => navigate('/')}>
          ← ボード一覧
        </button>
        <span className="app__title">{title}</span>
        {readonly && <span className="badge badge--warn">閲覧のみ</span>}
        {!readonly && (
          <button className="link" onClick={() => navigate(`/form/${encodeURIComponent(roomId)}`)}>
            依頼フォーム
          </button>
        )}
        <span className="app__meta">
          <span className={`dot dot--${status}`} />
          {status === 'online' ? `接続中 · 他 ${peers} 人` : status === 'connecting' ? '接続中…' : '切断'}
          {' · '}
          {user.name}({roleLabel(user.role)})
          <button className="link" onClick={toggleDrawer} data-testid="toggle-drawer">
            {drawerOpen ? '一覧を閉じる' : '一覧を開く'}
          </button>
        </span>
      </header>
      <aside className="app__sidebar">
        {editor ? <Sidebar editor={editor} roomId={roomId} readonly={readonly} /> : <p className="muted">読み込み中…</p>}
      </aside>
      <main className="app__board">
        <Board
          roomId={roomId}
          userName={user.name}
          readonly={readonly}
          demo={demo}
          onStatus={setStatus}
          onPeers={setPeers}
          onEditor={setEditor}
        />
      </main>
      {drawerOpen && (
        <section className="app__drawer">
          {editor ? (
            <RequestSheet editor={editor} roomId={roomId} boardName={title} readonly={readonly} />
          ) : null}
        </section>
      )}
    </div>
  )
}

/** 埋め込み時: 選択中の依頼カードをホストへ通知する */
function SelectionNotifier({ editor, roomId }: { editor: Editor; roomId: string }): null {
  const sel = useSingleSelection(editor)
  const card = sel?.type === 'request-card' ? sel : null
  const shapeId = card?.id ?? null
  const partNo = card?.partNo
  const status = card?.status
  useEffect(() => {
    notifyHost({ event: 'card-selected', roomId, shapeId, partNo, status })
  }, [roomId, shapeId, partNo, status])
  return null
}
