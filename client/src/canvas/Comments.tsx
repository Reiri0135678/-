import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Circle, Group, Text } from 'react-konva'
import type { CommentThread } from '@shared/shapes'
import type { BoardEditor } from './editor'
import type { Point } from './types'
import { shapeBounds } from './geometry'
import { useEditorSnapshot } from './hooks'

/** コメントのピン位置(図形付きなら図形の右上、無ければ座標) */
export function commentPoint(c: CommentThread, editor: BoardEditor): Point {
  if (c.shapeId) {
    const s = editor.getShape(c.shapeId)
    if (s) {
      const b = shapeBounds(s)
      return { x: b.x + b.w, y: b.y }
    }
  }
  return { x: c.x, y: c.y }
}

/** キャンバス上のコメントピン(Konva) */
export function CommentPins({ editor, onOpen }: { editor: BoardEditor; onOpen: (id: string) => void }): JSX.Element {
  const snap = useEditorSnapshot(editor)
  const k = 1 / snap.camera.scale
  const list = snap.comments.filter((c) => c.page === snap.currentPage && (snap.showResolved || !c.resolved))
  return (
    <>
      {list.map((c) => {
        const p = commentPoint(c, editor)
        const n = 1 + c.replies.length
        return (
          <Group
            key={c.id}
            x={p.x}
            y={p.y}
            scaleX={k}
            scaleY={k}
            onPointerDown={(e) => {
              e.cancelBubble = true
              onOpen(c.id)
            }}
            onClick={(e) => {
              e.cancelBubble = true
            }}
            commentId={c.id}
          >
            <Circle radius={13} fill={c.resolved ? '#b0aea5' : '#d97757'} stroke="#fffefb" strokeWidth={2} shadowColor="rgba(20,20,19,.2)" shadowBlur={6} shadowOffsetY={2} />
            <Text text={n > 1 ? String(n) : '💬'} x={-13} y={-7} width={26} align="center" fontSize={n > 1 ? 12 : 13} fill="#fff" fontStyle="bold" listening={false} />
          </Group>
        )
      })}
    </>
  )
}

export interface CommentPopoverState {
  /** 既存スレッドの id、または新規作成の位置 */
  id?: string
  at?: Point
  shapeId?: string | null
}

/** コメントの吹き出し(HTML)。スレッド表示・返信・解決・削除、または新規作成 */
export function CommentPopover({ editor, state, onClose }: { editor: BoardEditor; state: CommentPopoverState; onClose: () => void }): JSX.Element | null {
  const snap = useEditorSnapshot(editor)
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [state.id, state.at])
  const thread = state.id ? snap.comments.find((c) => c.id === state.id) : undefined
  if (state.id && !thread) return null
  const at = thread ? commentPoint(thread, editor) : state.at!
  const screen = editor.pageToScreen(at)
  const submit = () => {
    if (!text.trim()) return
    if (thread) editor.replyComment(thread.id, text)
    else editor.addComment({ shapeId: state.shapeId ?? null, x: at.x, y: at.y, text: text.trim() })
    setText('')
    if (!thread) onClose()
  }
  const fmt = (ts: number) => new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="comment-pop" style={{ left: Math.min(screen.x + 18, window.innerWidth - 340), top: Math.max(8, screen.y - 10) }} data-testid="comment-pop" onPointerDown={(e) => e.stopPropagation()}>
      <div className="comment-pop__head">
        <b>{thread ? 'コメント' : '新しいコメント'}</b>
        {thread && (
          <span className="comment-pop__actions">
            {thread.resolved ? (
              <button className="link" onClick={() => editor.resolveComment(thread.id, false)} data-testid="comment-reopen">
                再開
              </button>
            ) : (
              <button className="link" onClick={() => editor.resolveComment(thread.id, true)} data-testid="comment-resolve">
                解決
              </button>
            )}
            {thread.author === editor.userName && (
              <button className="link" onClick={() => { editor.deleteComment(thread.id); onClose() }} data-testid="comment-delete">
                削除
              </button>
            )}
          </span>
        )}
        <button className="link" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>
      {thread && (
        <ul className="comment-pop__list" data-testid="comment-list">
          <li>
            <b>{thread.author}</b> <span className="muted">{fmt(thread.ts)}</span>
            <p>{thread.text}</p>
          </li>
          {thread.replies.map((r, i) => (
            <li key={i}>
              <b>{r.author}</b> <span className="muted">{fmt(r.ts)}</span>
              <p>{r.text}</p>
            </li>
          ))}
        </ul>
      )}
      {!snap.readonly && (
        <div className="comment-pop__form">
          <textarea
            ref={ref}
            rows={2}
            value={text}
            placeholder={thread ? '返信…' : 'コメント…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
              if (e.key === 'Escape') onClose()
              e.stopPropagation()
            }}
            data-testid="comment-input"
          />
          <button className="btn btn--primary" onClick={submit} disabled={!text.trim()} data-testid="comment-submit">
            {thread ? '返信' : '投稿'}
          </button>
        </div>
      )}
    </div>
  )
}
