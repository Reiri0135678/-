import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { RequestCardShape } from '@shared/shapes'
import type { BoardEditor as Editor } from '../canvas/editor'
import { addCardAtCenter, focusShape, updateCard, useCards, useImages, useSingleSelection } from './useCards'
import { CardEditor } from './CardEditor'

/**
 * 左サイドバー: 選択中の依頼カードの編集フォーム + 図面・写真の一覧。
 * キャンバスの外にあるので editor を props で受け取り、スナップショットを購読する。
 */
export function Sidebar({ editor, roomId, readonly }: { editor: Editor; roomId: string; readonly: boolean }): JSX.Element {
  const cards = useCards(editor)
  const images = useImages(editor)
  const selected = useSingleSelection(editor)
  // 「図面を紐付け」モード中のカード id。選択がカードから外れてもフォームを固定する
  const [linkingFor, setLinkingFor] = useState<string | null>(null)

  const linkingCard = linkingFor ? cards.find((c) => c.id === linkingFor) ?? null : null
  const card: RequestCardShape | null =
    linkingCard ?? (selected?.type === 'request-card' ? (selected as RequestCardShape) : null)

  const link = (cardId: string, imageId: string) => {
    const c = editor.getShape<RequestCardShape>(cardId)
    if (!c || c.linkedShapeIds.includes(imageId)) return
    updateCard(editor, cardId, { linkedShapeIds: [...c.linkedShapeIds, imageId] })
  }
  const unlink = (cardId: string, imageId: string) => {
    const c = editor.getShape<RequestCardShape>(cardId)
    if (!c) return
    updateCard(editor, cardId, { linkedShapeIds: c.linkedShapeIds.filter((x) => x !== imageId) })
  }

  // 紐付けモード中にキャンバス上の画像を選択したら紐付けて終了
  useEffect(() => {
    if (!linkingFor || !selected || selected.type !== 'image') return
    link(linkingFor, selected.id)
    setLinkingFor(null)
    editor.select(linkingFor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingFor, selected])

  useEffect(() => {
    if (linkingFor && !linkingCard) setLinkingFor(null)
  }, [linkingFor, linkingCard])

  const addCard = () => addCardAtCenter(editor)

  return (
    <div className="panel">
      {card ? (
        <CardEditor
          editor={editor}
          roomId={roomId}
          card={card}
          readonly={readonly}
          linking={linkingFor === card.id}
          onStartLink={() => setLinkingFor(card.id)}
          onCancelLink={() => setLinkingFor(null)}
          onUnlink={(imgId) => unlink(card.id, imgId)}
        />
      ) : (
        <div className="panel__head">
          <h2>依頼カード</h2>
          {!readonly && (
            <button className="btn btn--primary" onClick={addCard} data-testid="add-card">
              + 依頼
            </button>
          )}
        </div>
      )}
      {!card && <p className="muted">キャンバス上のカードを選ぶと、ここで編集できます。</p>}

      <div className="panel__head">
        <h2>図面・写真</h2>
        <span className="muted">{images.length} 件</span>
      </div>
      {images.length === 0 ? (
        <p className="muted">画像ファイルをキャンバスにドラッグ&ドロップすると追加できます。</p>
      ) : (
        <ul className="gallery" data-testid="gallery">
          {images.map((img) => {
            const src = img.src || null
            const linkedCards = cards.filter((c) => c.linkedShapeIds.includes(img.id))
            const canLink = !!linkingFor && !linkedCards.some((c) => c.id === linkingFor)
            return (
              <li
                key={img.id}
                className="gallery__item"
                data-linking={canLink}
                onClick={() => {
                  if (linkingFor) {
                    link(linkingFor, img.id)
                    const id = linkingFor
                    setLinkingFor(null)
                    editor.select(id)
                  } else {
                    focusShape(editor, img.id)
                  }
                }}
                title={(img.name || '画像')}
              >
                {src ? <img src={src} alt="" /> : <div className="gallery__ph" />}
                <div className="gallery__meta">
                  <span className="gallery__name">{(img.name || '画像')}</span>
                  {linkedCards.length > 0 && <span className="badge">📋 {linkedCards.length}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

    </div>
  )
}
