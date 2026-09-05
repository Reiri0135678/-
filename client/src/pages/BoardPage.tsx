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
import { useEditorSnapshot } from '../canvas/hooks'
import { VersionsMenu } from '../canvas/VersionsMenu'

const DRAWER_KEY = 'qc.drawerOpen'
const DRAWER_H_KEY = 'qc.drawerHeight'
const DRAWER_MIN = 160

export function BoardPage({ roomId }: { roomId: string }): JSX.Element {
  const [user, setUser] = useState<Me | null | undefined>(undefined)
  const [title, setTitle] = useState(roomId)
  const [status, setStatus] = useState<BoardStatus>('connecting')
  const [peers, setPeers] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900)
  const [drawerH, setDrawerH] = useState(() => {
    try {
      const v = Number(localStorage.getItem(DRAWER_H_KEY))
      return v >= DRAWER_MIN ? v : 260
    } catch {
      return 260
    }
  })
  // ドロワー上端のドラッグで高さを変える
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = drawerH
    const max = Math.round(window.innerHeight * 0.75)
    const move = (ev: PointerEvent) => setDrawerH(Math.min(max, Math.max(DRAWER_MIN, startH + (startY - ev.clientY))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrawerH((h) => {
        try {
          localStorage.setItem(DRAWER_H_KEY, String(h))
        } catch {
          /* ignore */
        }
        return h
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
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
    <div className="app" data-drawer={drawerOpen} data-sidebar={sidebarOpen} data-embed={isEmbed()} style={{ ['--drawer-h' as string]: `${drawerH}px` }}>
      {editor && <SelectionNotifier editor={editor} roomId={roomId} />}
      <header className="app__header">
        <button className="link" onClick={() => navigate('/')}>
          ← ボード一覧
        </button>
        <button className="link sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} data-testid="toggle-sidebar">
          {sidebarOpen ? '☰ 閉じる' : '☰'}
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
          {status === 'online' ? (editor ? <Peers editor={editor} /> : `接続中 · 他 ${peers} 人`) : status === 'connecting' ? '接続中…' : '切断'}
          {' · '}
          {user.name}({roleLabel(user.role)})
          <VersionsMenu roomId={roomId} readonly={readonly} />
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
          <div className="app__drawer-handle" onPointerDown={startResize} title="ドラッグで高さを変更" data-testid="drawer-handle" />
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

/** 接続中の人数。クリックで一覧を出し、相手の画面に追従できる */
function Peers({ editor }: { editor: Editor }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  const [open, setOpen] = useState(false)
  return (
    <span className="peers">
      <button className="link" onClick={() => setOpen((v) => !v)} data-testid="peers-btn">
        接続中 · 他 {snap.collaborators.length} 人
      </button>
      {open && (
        <div className="peers__pop" data-testid="peers-pop">
          {snap.collaborators.length === 0 && <span className="muted">他に接続している人はいません</span>}
          {snap.collaborators.map((c) => (
            <div key={c.clientId} className="peers__row">
              <span className="peers__dot" style={{ background: c.color }} />
              <span>{c.name}</span>
              <span className="muted">{snap.pages.find((p) => p.id === c.page)?.name ?? ''}</span>
              <button
                className="chip"
                data-active={snap.following === c.clientId}
                onClick={() => {
                  editor.follow(snap.following === c.clientId ? null : c.clientId)
                  setOpen(false)
                }}
                data-testid={`follow-${c.name}`}
              >
                {snap.following === c.clientId ? '追従中' : '追従'}
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
