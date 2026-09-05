import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import {
  PRIORITIES,
  REQUEST_STATUSES,
  RESULTS,
  canTransition,
  todayString,
  type ImageShape,
  type InspectionResult,
  type Priority,
  type RequestCardShape,
  type RequestStatus
} from '@shared/shapes'
import { fetchHistory, type HistoryEntry } from '../api'
import type { BoardEditor as Editor } from '../canvas/editor'
import { addCardAtCenter, focusShape, updateCard, useCards, useImages, useSingleSelection } from './useCards'

type TLShapeId = string
const imageSrc = (_e: Editor, img: ImageShape) => img.src || null
const imageName = (_e: Editor, img: ImageShape) => img.name || '画像'

/**
 * 左サイドバー: 選択中の依頼カードの編集フォーム + 図面・写真の一覧。
 * キャンバスの外にあるので editor を props で受け取り、スナップショットを購読する。
 */
export function Sidebar({ editor, roomId, readonly }: { editor: Editor; roomId: string; readonly: boolean }): JSX.Element {
  const cards = useCards(editor)
  const images = useImages(editor)
  const selected = useSingleSelection(editor)
  // 「図面を紐付け」モード中のカード id。選択がカードから外れてもフォームを固定する
  const [linkingFor, setLinkingFor] = useState<TLShapeId | null>(null)

  const linkingCard = linkingFor ? cards.find((c) => c.id === linkingFor) ?? null : null
  const card: RequestCardShape | null =
    linkingCard ?? (selected?.type === 'request-card' ? (selected as RequestCardShape) : null)

  const link = (cardId: TLShapeId, imageId: TLShapeId) => {
    const c = editor.getShape<RequestCardShape>(cardId)
    if (!c || c.linkedShapeIds.includes(imageId)) return
    updateCard(editor, cardId, { linkedShapeIds: [...c.linkedShapeIds, imageId] })
  }
  const unlink = (cardId: TLShapeId, imageId: TLShapeId) => {
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
            const src = imageSrc(editor, img)
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
                title={imageName(editor, img)}
              >
                {src ? <img src={src} alt="" /> : <div className="gallery__ph" />}
                <div className="gallery__meta">
                  <span className="gallery__name">{imageName(editor, img)}</span>
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

function CardEditor({
  editor,
  roomId,
  card,
  readonly,
  linking,
  onStartLink,
  onCancelLink,
  onUnlink
}: {
  editor: Editor
  roomId: string
  card: RequestCardShape
  readonly: boolean
  linking: boolean
  onStartLink: () => void
  onCancelLink: () => void
  onUnlink: (imageId: TLShapeId) => void
}): JSX.Element {
  const p = card
  const update = (patch: Partial<RequestCardShape>) => updateCard(editor, card.id, patch)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  useEffect(() => {
    if (!showHistory) return
    fetchHistory(roomId, card.id).then(setHistory).catch(() => setHistory([]))
  }, [showHistory, roomId, card.id, card.updatedAt])
  const field = (label: string, key: 'title' | 'dept' | 'partNo' | 'lot' | 'qty' | 'requester' | 'assignee', placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input
        value={String(p[key])}
        placeholder={placeholder}
        disabled={readonly}
        onChange={(e) => update({ [key]: e.target.value } as Partial<RequestCardShape>)}
        data-field={key}
      />
    </label>
  )
  const linked = p.linkedShapeIds
    .map((id) => editor.getShape(id))
    .filter((s): s is ImageShape => !!s && s.type === 'image')

  return (
    <div className="editor" data-testid="card-editor">
      <div className="panel__head">
        <h2>{p.no || '(採番待ち)'}</h2>
        {!readonly && p.status !== '取消' && (
          <button className="btn btn--danger" onClick={() => update({ status: '取消' })} title="カードは消さずに取消状態にします" data-testid="cancel-card">
            取消
          </button>
        )}
      </div>
      <div className="badges">
        {p.priority === '至急' && <span className="badge badge--urgent">至急</span>}
        {p.kintoneRecordId && <span className="badge badge--ok">kintone #{p.kintoneRecordId}</span>}
        {p.archived && <span className="badge">アーカイブ済み</span>}
      </div>
      {!readonly && p.archived && (
        <button className="btn" onClick={() => update({ archived: false })}>
          ボードに戻す
        </button>
      )}
      <label className="field">
        <span>状態</span>
        <select
          value={p.status}
          disabled={readonly}
          onChange={(e) => update({ status: e.target.value as RequestStatus })}
          data-field="status"
        >
          {REQUEST_STATUSES.filter((s) => canTransition(p.status, s)).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>優先度</span>
        <select value={p.priority} disabled={readonly} onChange={(e) => update({ priority: e.target.value as Priority })} data-field="priority">
          {PRIORITIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {field('件名', 'title')}
      {field('依頼部門', 'dept')}
      {field('品番', 'partNo', '例: A-1234')}
      {field('ロット', 'lot')}
      {field('数量', 'qty')}
      {field('依頼者', 'requester')}
      <label className="field">
        <span>依頼日</span>
        <input
          type="date"
          value={p.requestedAt}
          disabled={readonly}
          onChange={(e) => update({ requestedAt: e.target.value })}
          data-field="requestedAt"
        />
      </label>
      <label className="field">
        <span>希望納期</span>
        <input type="date" value={p.dueDate} disabled={readonly} onChange={(e) => update({ dueDate: e.target.value })} data-field="dueDate" />
      </label>
      {field('担当検査員', 'assignee')}
      <label className="field">
        <span>備考・検査項目</span>
        <textarea
          rows={3}
          value={p.note}
          disabled={readonly}
          onChange={(e) => update({ note: e.target.value })}
          data-field="note"
        />
      </label>

      <div className="panel__head">
        <h3>検査結果</h3>
        {p.judgedAt && (
          <span className="muted">
            {p.judgedBy} · {p.judgedAt}
          </span>
        )}
      </div>
      <div className="result-row" data-testid="result-row">
        {RESULTS.map((r) => (
          <button
            key={r}
            className="chip"
            data-active={p.result === r}
            data-result={r}
            disabled={readonly}
            onClick={() =>
              update(
                r === '未判定'
                  ? { result: r, judgedBy: '', judgedAt: '' }
                  : { result: r as InspectionResult, judgedBy: editor.userName, judgedAt: todayString() }
              )
            }
          >
            {r}
          </button>
        ))}
      </div>
      <label className="field">
        <span>測定値・所見</span>
        <textarea rows={2} value={p.resultNote} disabled={readonly} onChange={(e) => update({ resultNote: e.target.value })} data-field="resultNote" />
      </label>

      <div className="panel__head">
        <h3>関連図面 {linked.length > 0 && `(${linked.length})`}</h3>
        {!readonly &&
          (linking ? (
            <button className="btn" onClick={onCancelLink}>
              中止
            </button>
          ) : (
            <button className="btn" onClick={onStartLink} data-testid="start-link">
              図面を紐付け
            </button>
          ))}
      </div>
      {linking && <p className="hint">キャンバス上の図面、または下の一覧の図面をクリックしてください。</p>}
      {linked.length > 0 && (
        <ul className="linked" data-testid="linked-images">
          {linked.map((img) => {
            const src = imageSrc(editor, img)
            return (
              <li key={img.id}>
                <button className="linked__thumb" onClick={() => focusShape(editor, img.id)} title="図面へ移動">
                  {src ? <img src={src} alt="" /> : <div className="gallery__ph" />}
                </button>
                <span className="gallery__name">{imageName(editor, img)}</span>
                {!readonly && (
                  <button className="link" onClick={() => onUnlink(img.id)} title="紐付けを外す">
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="panel__head">
        <h3>変更履歴</h3>
        <button className="link" onClick={() => setShowHistory((v) => !v)} data-testid="toggle-history">
          {showHistory ? '閉じる' : '表示'}
        </button>
      </div>
      {showHistory && (
        <ul className="history" data-testid="history">
          {history === null && <li className="muted">読み込み中…</li>}
          {history?.length === 0 && <li className="muted">履歴はまだありません</li>}
          {history?.map((h, i) => (
            <li key={i}>
              <span className="history__when">{new Date(h.ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <b>{h.user}</b>
              <span>{describe(h)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = {
  status: '状態',
  title: '件名',
  dept: '部門',
  partNo: '品番',
  lot: 'ロット',
  qty: '数量',
  requester: '依頼者',
  requestedAt: '依頼日',
  note: '備考',
  assignee: '担当',
  dueDate: '納期',
  priority: '優先度',
  archived: 'アーカイブ',
  linkedShapeIds: '関連図面',
  kintoneRecordId: 'kintone',
  no: '受付番号',
  x: '位置',
  y: '位置',
  w: '大きさ',
  h: '大きさ',
  rotation: '回転',
  z: '重なり'
}

function describe(h: HistoryEntry): string {
  if (h.action === 'create') return '作成'
  if (h.action === 'delete') return '削除'
  const parts = Object.entries(h.fields)
    .filter(([k]) => !['x', 'y', 'w', 'h', 'z', 'rotation'].includes(k))
    .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${Array.isArray(v) ? `${v.length} 件` : typeof v === 'boolean' ? (v ? 'はい' : 'いいえ') : String(v ?? '')}`)
  if (parts.length === 0) return '移動・サイズ変更'
  return parts.join(' / ')
}
