import type { JSX } from 'react'
import { useValue, type Editor, type TLShapeId } from 'tldraw'
import { REQUEST_STATUSES, todayString, type RequestStatus } from '@shared/request-card'
import type { RequestCardShape } from '../canvas/RequestCardShape'

/**
 * サイドバー: 依頼カードの一覧と、選択中カードの編集フォーム。
 * tldraw の React コンテキスト外にあるので、editor を props で受け取り useValue で購読する。
 */
export function RequestPanel({ editor }: { editor: Editor }): JSX.Element {
  const cards = useValue(
    'request cards',
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s): s is RequestCardShape => s.type === 'request-card')
        .sort((a, b) => (a.props.requestedAt || '').localeCompare(b.props.requestedAt || '')),
    [editor]
  )
  const selected = useValue(
    'selected card',
    () => {
      const sel = editor.getSelectedShapes()
      return sel.length === 1 && sel[0]!.type === 'request-card' ? (sel[0] as RequestCardShape) : null
    },
    [editor]
  )

  const counts = REQUEST_STATUSES.map((st) => [st, cards.filter((c) => c.props.status === st).length] as const)

  const focus = (id: TLShapeId) => {
    editor.select(id)
    editor.zoomToSelection({ animation: { duration: 200 } })
  }

  const addCard = () => {
    const c = editor.getViewportPageBounds().center
    editor.createShape<RequestCardShape>({
      type: 'request-card',
      x: c.x - 110,
      y: c.y - 66,
      props: { requester: editor.user.getName(), requestedAt: todayString() }
    })
    const created = editor.getCurrentPageShapes().at(-1)
    if (created) editor.select(created.id)
  }

  return (
    <div className="panel">
      {selected && <RequestEditor editor={editor} card={selected} />}

      <div className="panel__head">
        <h2>依頼リスト</h2>
        <button className="btn btn--primary" onClick={addCard} data-testid="add-card">
          + 依頼
        </button>
      </div>
      <div className="counts">
        {counts.map(([st, n]) => (
          <span key={st} className="counts__item" data-status={st}>
            {st} {n}
          </span>
        ))}
      </div>
      {cards.length === 0 ? (
        <p className="muted">まだ依頼はありません。「+ 依頼」またはツールバーの「依頼」で追加できます。</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>状態</th>
              <th>品番</th>
              <th>部門</th>
              <th>依頼日</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr
                key={c.id}
                data-selected={selected?.id === c.id}
                onClick={() => focus(c.id)}
                data-testid="card-row"
              >
                <td>
                  <span className="qc-card__status" data-status={c.props.status}>
                    {c.props.status}
                  </span>
                </td>
                <td>{c.props.partNo || '-'}</td>
                <td>{c.props.dept}</td>
                <td>{c.props.requestedAt || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RequestEditor({ editor, card }: { editor: Editor; card: RequestCardShape }): JSX.Element {
  const p = card.props
  const update = (patch: Partial<RequestCardShape['props']>) => {
    editor.updateShape<RequestCardShape>({ id: card.id, type: 'request-card', props: patch })
  }
  const field = (label: string, key: keyof typeof p, placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input
        value={String(p[key])}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value } as Partial<RequestCardShape['props']>)}
        data-field={key}
      />
    </label>
  )

  return (
    <div className="editor" data-testid="card-editor">
      <div className="panel__head">
        <h2>依頼カードの編集</h2>
        <button className="btn btn--danger" onClick={() => editor.deleteShapes([card.id])}>
          削除
        </button>
      </div>
      <label className="field">
        <span>状態</span>
        <select
          value={p.status}
          onChange={(e) => update({ status: e.target.value as RequestStatus })}
          data-field="status"
        >
          {REQUEST_STATUSES.map((s) => (
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
          onChange={(e) => update({ requestedAt: e.target.value })}
          data-field="requestedAt"
        />
      </label>
      <label className="field">
        <span>備考・検査項目</span>
        <textarea rows={3} value={p.note} onChange={(e) => update({ note: e.target.value })} data-field="note" />
      </label>
    </div>
  )
}
