import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Editor } from 'tldraw'
import {
  REQUEST_STATUSES,
  todayString,
  toCsv,
  toRequestRecord,
  type RequestRecord,
  type RequestStatus
} from '@shared/request-card'
import { kintoneStatus, kintoneSync, type KintoneStatus } from '../api'
import type { RequestCardShape } from '../canvas/RequestCardShape'
import { focusShape, updateCard, useCards, useSingleSelection } from './useCards'

type SortKey = keyof RequestRecord
interface Column {
  key: SortKey
  label: string
  width: number
  kind: 'select' | 'text' | 'date' | 'readonly'
}

const COLUMNS: Column[] = [
  { key: 'status', label: '状態', width: 92, kind: 'select' },
  { key: 'title', label: '件名', width: 120, kind: 'text' },
  { key: 'dept', label: '依頼部門', width: 100, kind: 'text' },
  { key: 'partNo', label: '品番', width: 110, kind: 'text' },
  { key: 'lot', label: 'ロット', width: 100, kind: 'text' },
  { key: 'qty', label: '数量', width: 64, kind: 'text' },
  { key: 'requester', label: '依頼者', width: 90, kind: 'text' },
  { key: 'requestedAt', label: '依頼日', width: 130, kind: 'date' },
  { key: 'note', label: '備考', width: 220, kind: 'text' },
  { key: 'kintoneRecordId', label: 'kintone', width: 80, kind: 'readonly' }
]

/** 下部ドロワー: 依頼カードのスプレッドシート(セル直接編集・並べ替え・絞り込み・CSV・kintone 送信) */
export function RequestSheet({
  editor,
  roomId,
  boardName,
  readonly
}: {
  editor: Editor
  roomId: string
  boardName: string
  readonly: boolean
}): JSX.Element {
  const cards = useCards(editor)
  const selected = useSingleSelection(editor)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'requestedAt', dir: 1 })
  const [kstatus, setKstatus] = useState<KintoneStatus | null>(null)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    kintoneStatus().then(setKstatus).catch(() => setKstatus({ mode: 'unconfigured' }))
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = cards
      .map((c) => ({ card: c, rec: toRequestRecord(c, boardName) }))
      .filter(({ rec }) => !statusFilter || rec.status === statusFilter)
      .filter(({ rec }) => !q || Object.values(rec).some((v) => String(v).toLowerCase().includes(q)))
    list.sort((a, b) => {
      const av = String(a.rec[sort.key] ?? '')
      const bv = String(b.rec[sort.key] ?? '')
      return av.localeCompare(bv, 'ja') * sort.dir
    })
    return list
  }, [cards, boardName, query, statusFilter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const exportCsv = () => {
    const csv = toCsv(rows.map((r) => r.rec))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `検査依頼_${boardName}_${todayString()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const doSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await kintoneSync(roomId)
      setSyncMsg(`kintone へ送信: 新規 ${r.created} 件 / 更新 ${r.updated} 件(全 ${r.total} 件)`)
    } catch (e) {
      setSyncMsg(`送信失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
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

  const counts = REQUEST_STATUSES.map((st) => [st, cards.filter((c) => c.props.status === st).length] as const)
  const kintoneLabel =
    kstatus?.mode === 'mock' ? 'kintone へ送信(モック)' : kstatus?.mode === 'configured' ? 'kintone へ送信' : 'kintone 未設定'

  return (
    <div className="sheet" data-testid="sheet">
      <div className="sheet__bar">
        <strong>依頼一覧</strong>
        <span className="counts">
          {counts.map(([st, n]) => (
            <span key={st} className="counts__item" data-status={st}>
              {st} {n}
            </span>
          ))}
        </span>
        <input
          className="sheet__search"
          placeholder="検索(品番・部門・備考など)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="sheet-search"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')} data-testid="sheet-filter">
          <option value="">すべての状態</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="sheet__spacer" />
        {!readonly && (
          <button className="btn btn--primary" onClick={addCard} data-testid="sheet-add">
            + 依頼
          </button>
        )}
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0} data-testid="sheet-csv">
          CSV
        </button>
        {!readonly && (
          <button
            className="btn"
            onClick={doSync}
            disabled={syncing || !kstatus || kstatus.mode === 'unconfigured' || cards.length === 0}
            title={kstatus?.mode === 'unconfigured' ? 'config/kintone.json を設定してください' : ''}
            data-testid="sheet-kintone"
          >
            {syncing ? '送信中…' : kintoneLabel}
          </button>
        )}
      </div>
      {syncMsg && (
        <div className="sheet__msg" data-testid="sync-msg">
          {syncMsg}
        </div>
      )}
      <div className="sheet__scroll">
        <table className="grid">
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} data-sorted={sort.key === c.key ? sort.dir : undefined}>
                  {c.label}
                  {sort.key === c.key && <span className="grid__arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="muted">
                  {cards.length === 0 ? '依頼はまだありません' : '条件に合う依頼がありません'}
                </td>
              </tr>
            )}
            {rows.map(({ card, rec }) => (
              <tr
                key={card.id}
                data-selected={selected?.id === card.id}
                data-testid="sheet-row"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('input,select')) return
                  focusShape(editor, card.id)
                }}
              >
                {COLUMNS.map((c) => (
                  <td key={c.key}>
                    <Cell
                      column={c}
                      value={String(rec[c.key] ?? '')}
                      readonly={readonly}
                      onChange={(v) => updateCard(editor, card.id, { [c.key]: v } as Partial<RequestCardShape['props']>)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Cell({
  column,
  value,
  readonly,
  onChange
}: {
  column: Column
  value: string
  readonly: boolean
  onChange: (v: string) => void
}): JSX.Element {
  if (column.kind === 'readonly' || readonly) {
    return <span className="grid__ro">{value || (column.kind === 'readonly' ? '-' : '')}</span>
  }
  if (column.kind === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} data-col={column.key}>
        {REQUEST_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      type={column.kind === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      data-col={column.key}
    />
  )
}
