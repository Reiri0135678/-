import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CARD_H,
  CARD_W,
  CLOSED_STATUSES,
  PRIORITIES,
  REQUEST_STATUSES,
  RESULTS,
  canTransition,
  csvToRequests,
  parseCsv,
  todayString,
  toCsv,
  toRequestRecord,
  type ImportedRow,
  type Priority,
  type RequestCardShape,
  type RequestRecord,
  type RequestStatus
} from '@shared/shapes'
import { kintoneStatus, kintoneSync, type KintoneStatus } from '../api'
import type { BoardEditor as Editor } from '../canvas/editor'
import { addCardAtCenter, focusShape, updateCard, useCards, useSingleSelection } from './useCards'

type SortKey = keyof RequestRecord
interface Column {
  key: SortKey
  label: string
  width: number
  kind: 'select' | 'priority' | 'result' | 'text' | 'date' | 'readonly'
}

const COLUMNS: Column[] = [
  { key: 'no', label: '受付番号', width: 118, kind: 'readonly' },
  { key: 'status', label: '状態', width: 100, kind: 'select' },
  { key: 'priority', label: '優先度', width: 84, kind: 'priority' },
  { key: 'title', label: '件名', width: 120, kind: 'text' },
  { key: 'dept', label: '依頼部門', width: 100, kind: 'text' },
  { key: 'partNo', label: '品番', width: 110, kind: 'text' },
  { key: 'lot', label: 'ロット', width: 100, kind: 'text' },
  { key: 'qty', label: '数量', width: 64, kind: 'text' },
  { key: 'requester', label: '依頼者', width: 90, kind: 'text' },
  { key: 'requestedAt', label: '依頼日', width: 130, kind: 'date' },
  { key: 'dueDate', label: '希望納期', width: 130, kind: 'date' },
  { key: 'assignee', label: '担当', width: 90, kind: 'text' },
  { key: 'note', label: '備考', width: 200, kind: 'text' },
  { key: 'result', label: '結果', width: 110, kind: 'result' },
  { key: 'resultNote', label: '所見', width: 160, kind: 'text' },
  { key: 'judgedBy', label: '判定者', width: 80, kind: 'readonly' },
  { key: 'judgedAt', label: '判定日', width: 96, kind: 'readonly' },
  { key: 'kintoneRecordId', label: 'kintone', width: 80, kind: 'readonly' }
]

const DAY = 86400_000
const COLS_KEY = 'qc.sheet.cols'
const WIDTHS_KEY = 'qc.sheet.widths'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function saveJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/** 納期の状態: 超過 / 2 日以内 / 余裕 / 納期なし・終了済み */
export function dueState(rec: Pick<RequestRecord, 'dueDate' | 'status'>, today = todayString()): 'overdue' | 'soon' | 'ok' | 'none' {
  if (!rec.dueDate || CLOSED_STATUSES.includes(rec.status)) return 'none'
  const diff = Math.round((Date.parse(rec.dueDate) - Date.parse(today)) / DAY)
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return 'ok'
}

/** 下部ドロワー: 依頼カードのスプレッドシート(セル直接編集・キーボード移動・一括変更・並べ替え・絞り込み・集計・CSV・kintone 送信) */
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
  const [view, setView] = useState<'list' | 'summary'>('list')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('')
  const [deptFilter, setDeptFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'no', dir: -1 })
  const [showArchived, setShowArchived] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [hidden, setHidden] = useState<Set<SortKey>>(() => new Set(loadJson<SortKey[]>(COLS_KEY, [])))
  const [widths, setWidths] = useState<Partial<Record<SortKey, number>>>(() => loadJson(WIDTHS_KEY, {}))
  const [colsOpen, setColsOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<{ rows: ImportedRow[]; unknown: string[]; create: number; update: number } | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [kstatus, setKstatus] = useState<KintoneStatus | null>(null)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const today = todayString()

  useEffect(() => {
    kintoneStatus().then(setKstatus).catch(() => setKstatus({ mode: 'unconfigured' }))
  }, [])

  const depts = useMemo(() => [...new Set(cards.map((c) => c.dept).filter(Boolean))].sort(), [cards])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = cards
      .map((c) => ({ card: c, rec: toRequestRecord(c, boardName), due: dueState(c, today) }))
      .filter(({ rec }) => showArchived || !rec.archived)
      .filter(({ rec }) => !statusFilter || rec.status === statusFilter)
      .filter(({ rec }) => !deptFilter || rec.dept === deptFilter)
      .filter(({ due }) => !overdueOnly || due === 'overdue')
      .filter(({ rec }) => !from || (rec.requestedAt && rec.requestedAt >= from))
      .filter(({ rec }) => !to || (rec.requestedAt && rec.requestedAt <= to))
      .filter(({ rec }) => !q || Object.values(rec).some((v) => String(v).toLowerCase().includes(q)))
    list.sort((a, b) => {
      const av = String(a.rec[sort.key] ?? '')
      const bv = String(b.rec[sort.key] ?? '')
      return av.localeCompare(bv, 'ja') * sort.dir
    })
    return list
  }, [cards, boardName, query, statusFilter, deptFilter, overdueOnly, from, to, sort, showArchived, today])

  // 表示から消えた行のチェックは外す
  useEffect(() => {
    setChecked((prev) => {
      const ids = new Set(rows.map((r) => r.card.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

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

  // ---- キーボード移動: ↑↓ Enter で同じ列の隣の行へ、Esc でフォーカスを外す ----------
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return
    const col = t.dataset['col']
    const tr = t.closest('tr')
    if (!col || !tr) return
    let dir = 0
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey && !(t instanceof HTMLSelectElement))) dir = 1
    else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) dir = -1
    else if (e.key === 'Escape') {
      t.blur()
      return
    }
    if (!dir) return
    const target = dir === 1 ? tr.nextElementSibling : tr.previousElementSibling
    const next = target?.querySelector<HTMLElement>(`input[data-col="${col}"], select[data-col="${col}"]`)
    if (next) {
      e.preventDefault()
      next.focus()
      if (next instanceof HTMLInputElement) next.select()
    }
  }

  // ---- 一括変更 ----------------------------------------------------------
  const checkedCards = rows.filter((r) => checked.has(r.card.id)).map((r) => r.card)
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.card.id))
  const bulk = (patch: Partial<RequestCardShape>) => {
    editor.updateShapes(checkedCards.map((c) => ({ id: c.id, patch })))
  }
  /** 選択中の全カードから移れる状態だけ */
  const bulkStatuses = REQUEST_STATUSES.filter((s) => checkedCards.length > 0 && checkedCards.every((c) => canTransition(c.status, s)))
  const [bulkAssignee, setBulkAssignee] = useState('')

  const addCard = () => addCardAtCenter(editor)

  // ---- 表示列と列幅 ----------------------------------------------------
  const visible = COLUMNS.filter((c) => !hidden.has(c.key))
  const toggleColumn = (key: SortKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < COLUMNS.length - 1) next.add(key)
      saveJson(COLS_KEY, [...next])
      return next
    })
  }
  const widthOf = (c: Column) => widths[c.key] ?? c.width
  const startResize = (key: SortKey, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const col = COLUMNS.find((c) => c.key === key)!
    const startX = e.clientX
    const startW = widthOf(col)
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [key]: Math.max(48, startW + ev.clientX - startX) }))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setWidths((w) => {
        saveJson(WIDTHS_KEY, w)
        return w
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ---- CSV 取り込み ------------------------------------------------------
  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    setImportMsg('')
    const text = await file.text()
    const { rows: parsed, unknownHeaders } = csvToRequests(parseCsv(text))
    const byNo = new Map(cards.map((c) => [c.no, c]))
    const update = parsed.filter((r) => r.no && byNo.has(r.no)).length
    setImportPreview({ rows: parsed, unknown: unknownHeaders, create: parsed.length - update, update })
    if (fileRef.current) fileRef.current.value = ''
  }
  const applyImport = () => {
    if (!importPreview) return
    const byNo = new Map(cards.map((c) => [c.no, c]))
    const updates: Array<{ id: string; patch: Partial<RequestCardShape> }> = []
    let created = 0
    let index = cards.filter((c) => !c.archived).length
    for (const r of importPreview.rows) {
      const existing = r.no ? byNo.get(r.no) : undefined
      if (existing) {
        updates.push({ id: existing.id, patch: r.fields })
        continue
      }
      const col = index % 4
      const row = Math.floor(index / 4)
      index++
      editor.createShape<RequestCardShape>({
        type: 'request-card',
        x: 40 + col * (CARD_W + 30),
        y: 40 + row * (CARD_H + 30),
        requester: editor.userName,
        requestedAt: todayString(),
        ...r.fields
      })
      created++
    }
    if (updates.length) editor.updateShapes(updates)
    setImportMsg(`CSV 取り込み: 新規 ${created} 件 / 更新 ${updates.length} 件`)
    setImportPreview(null)
  }

  const active = cards.filter((c) => !c.archived)
  const counts = REQUEST_STATUSES.map((st) => [st, active.filter((c) => c.status === st).length] as const).filter(([, n]) => n > 0)
  const overdue = active.filter((c) => dueState(c, today) === 'overdue').length
  const archivable = active.filter((c) => CLOSED_STATUSES.includes(c.status))
  const archiveClosed = () => editor.updateShapes(archivable.map((c) => ({ id: c.id, patch: { archived: true } })))
  const kintoneLabel = kstatus?.mode === 'mock' ? 'kintone へ送信(モック)' : kstatus?.mode === 'configured' ? 'kintone へ送信' : 'kintone 未設定'

  return (
    <div className="sheet" data-testid="sheet">
      <div className="sheet__bar">
        <span className="sheet__tabs">
          <button className="tab" data-active={view === 'list'} onClick={() => setView('list')} data-testid="tab-list">
            依頼一覧
          </button>
          <button className="tab" data-active={view === 'summary'} onClick={() => setView('summary')} data-testid="tab-summary">
            集計
          </button>
        </span>
        <span className="counts">
          {counts.map(([st, n]) => (
            <span key={st} className="counts__item" data-status={st}>
              {st} {n}
            </span>
          ))}
          {overdue > 0 && (
            <span className="counts__item counts__item--overdue" data-testid="overdue-count">
              納期超過 {overdue}
            </span>
          )}
        </span>
        {view === 'list' && (
          <>
            <input className="sheet__search" placeholder="検索(品番・部門・備考など)" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="sheet-search" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')} data-testid="sheet-filter">
              <option value="">すべての状態</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} data-testid="sheet-dept">
              <option value="">すべての部門</option>
              {depts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <span className="sheet__period" title="依頼日の範囲">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="sheet-from" />
              〜
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="sheet-to" />
            </span>
            <label className="sheet__check">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} data-testid="sheet-overdue" />
              納期超過のみ
            </label>
            <label className="sheet__check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} data-testid="sheet-archived" />
              アーカイブも表示
            </label>
          </>
        )}
        <span className="sheet__spacer" />
        {!readonly && archivable.length > 0 && (
          <button className="btn" onClick={archiveClosed} title="完了・取消のカードをボードから外します(一覧と kintone には残ります)" data-testid="sheet-archive">
            完了・取消をアーカイブ({archivable.length})
          </button>
        )}
        {!readonly && (
          <button className="btn btn--primary" onClick={addCard} data-testid="sheet-add">
            + 依頼
          </button>
        )}
        {view === 'list' && (
          <span className="cols">
            <button className="btn" onClick={() => setColsOpen((v) => !v)} data-testid="sheet-cols">
              列
            </button>
            {colsOpen && (
              <div className="cols__pop" data-testid="cols-pop">
                {COLUMNS.map((c) => (
                  <label key={c.key}>
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleColumn(c.key)} data-col-toggle={c.key} />
                    {c.label}
                  </label>
                ))}
                <button
                  className="link"
                  onClick={() => {
                    setHidden(new Set())
                    setWidths({})
                    saveJson(COLS_KEY, [])
                    saveJson(WIDTHS_KEY, {})
                  }}
                >
                  初期状態に戻す
                </button>
              </div>
            )}
          </span>
        )}
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0} data-testid="sheet-csv">
          CSV
        </button>
        {!readonly && (
          <>
            <button className="btn" onClick={() => fileRef.current?.click()} title="CSV を取り込む(見出しは CSV 出力と同じ。受付番号があれば更新)" data-testid="sheet-import">
              取込
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} data-testid="import-file" />
          </>
        )}
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
      {importMsg && (
        <div className="sheet__msg" data-testid="import-msg">
          {importMsg}
        </div>
      )}
      {importPreview && (
        <div className="sheet__bulk" data-testid="import-preview">
          <strong>CSV 取り込みの確認</strong>
          <span>
            新規 {importPreview.create} 件 / 更新 {importPreview.update} 件(受付番号が一致)
            {importPreview.unknown.length > 0 && ` / 無視する列: ${importPreview.unknown.join(', ')}`}
          </span>
          <span className="sheet__spacer" />
          <button className="btn btn--primary" onClick={applyImport} disabled={importPreview.rows.length === 0} data-testid="import-apply">
            取り込む
          </button>
          <button className="link" onClick={() => setImportPreview(null)}>
            やめる
          </button>
        </div>
      )}

      {view === 'list' && !readonly && checkedCards.length > 0 && (
        <div className="sheet__bulk" data-testid="bulk-bar">
          <strong>{checkedCards.length} 件を選択中</strong>
          <select value="" onChange={(e) => e.target.value && bulk({ status: e.target.value as RequestStatus })} data-testid="bulk-status">
            <option value="">状態を変更…</option>
            {bulkStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value="" onChange={(e) => e.target.value && bulk({ priority: e.target.value as Priority })} data-testid="bulk-priority">
            <option value="">優先度を変更…</option>
            {PRIORITIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="sheet__bulk-assign">
            <input
              placeholder="担当を割り当て"
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && bulkAssignee.trim()) {
                  bulk({ assignee: bulkAssignee.trim() })
                  setBulkAssignee('')
                }
              }}
              data-testid="bulk-assignee"
            />
            <button
              className="btn"
              disabled={!bulkAssignee.trim()}
              onClick={() => {
                bulk({ assignee: bulkAssignee.trim() })
                setBulkAssignee('')
              }}
              data-testid="bulk-assignee-apply"
            >
              割当
            </button>
          </span>
          <button className="btn" onClick={() => bulk({ archived: true })} data-testid="bulk-archive">
            アーカイブ
          </button>
          <span className="sheet__spacer" />
          <button className="link" onClick={() => setChecked(new Set())} data-testid="bulk-clear">
            選択解除
          </button>
        </div>
      )}

      {view === 'summary' ? (
        <Summary cards={active} today={today} />
      ) : (
        <div className="sheet__scroll">
          <table
            className="grid"
            ref={tableRef}
            onKeyDown={onGridKeyDown}
            style={{ width: visible.reduce((w, c) => w + widthOf(c), readonly ? 0 : 32) }}
          >
            <colgroup>
              {!readonly && <col style={{ width: 32 }} />}
              {visible.map((c) => (
                <col key={c.key} style={{ width: widthOf(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {!readonly && (
                  <th className="grid__check">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.card.id)) : new Set())}
                      title="すべて選択"
                      data-testid="check-all"
                    />
                  </th>
                )}
                {visible.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} data-sorted={sort.key === c.key ? sort.dir : undefined} data-th={c.key}>
                    {c.label}
                    {sort.key === c.key && <span className="grid__arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
                    <span className="grid__resizer" onPointerDown={(e) => startResize(c.key, e)} onClick={(e) => e.stopPropagation()} data-resizer={c.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visible.length + 1} className="muted">
                    {cards.length === 0 ? '依頼はまだありません' : '条件に合う依頼がありません'}
                  </td>
                </tr>
              )}
              {rows.map(({ card, rec, due }) => (
                <tr
                  key={card.id}
                  data-selected={selected?.id === card.id}
                  data-checked={checked.has(card.id)}
                  data-priority={rec.priority}
                  data-due={due}
                  data-testid="sheet-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,select')) return
                    focusShape(editor, card.id)
                  }}
                >
                  {!readonly && (
                    <td className="grid__check">
                      <input
                        type="checkbox"
                        checked={checked.has(card.id)}
                        onChange={(e) => {
                          setChecked((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(card.id)
                            else next.delete(card.id)
                            return next
                          })
                        }}
                        data-testid="row-check"
                      />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} data-col={c.key} data-priority={c.key === 'priority' ? rec.priority : undefined} data-due={c.key === 'dueDate' ? due : undefined}>
                      <Cell
                        column={c}
                        value={String(rec[c.key] ?? '')}
                        readonly={readonly}
                        status={rec.status}
                        onChange={(v) => {
                          if (c.key === 'result') {
                            updateCard(editor, card.id, v === '未判定' ? { result: '未判定', judgedBy: '', judgedAt: '' } : { result: v as never, judgedBy: editor.userName, judgedAt: todayString() })
                            return
                          }
                          updateCard(editor, card.id, { [c.key]: v } as Partial<RequestCardShape>)
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** 集計ビュー: 状態別・部門別の件数、リードタイム、納期、担当別の持ち件数 */
function Summary({ cards, today }: { cards: RequestCardShape[]; today: string }): JSX.Element {
  const open = cards.filter((c) => !CLOSED_STATUSES.includes(c.status))
  const done = cards.filter((c) => c.status === '完了')
  const leadDays = done
    .map((c) => {
      const end = c.judgedAt || new Date(c.updatedAt).toISOString().slice(0, 10)
      return c.requestedAt ? (Date.parse(end) - Date.parse(c.requestedAt)) / DAY : NaN
    })
    .filter((d) => Number.isFinite(d) && d >= 0)
  const avgLead = leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null
  const overdue = open.filter((c) => dueState(c, today) === 'overdue')
  const soon = open.filter((c) => dueState(c, today) === 'soon')
  const urgent = open.filter((c) => c.priority === '至急')

  const byDept = groupCount(cards, (c) => c.dept || '(部門未設定)')
  const byAssignee = groupCount(open, (c) => c.assignee || '(未割当)')
  const results = RESULTS.map((r) => [r, cards.filter((c) => c.result === r).length] as const)

  return (
    <div className="summary" data-testid="summary">
      <div className="tiles">
        <Tile label="対応中" value={open.length} sub={`全 ${cards.length} 件中`} />
        <Tile label="納期超過" value={overdue.length} tone={overdue.length ? 'bad' : 'ok'} sub={soon.length ? `2 日以内 ${soon.length} 件` : ''} />
        <Tile label="至急(対応中)" value={urgent.length} tone={urgent.length ? 'warn' : 'ok'} />
        <Tile label="平均リードタイム" value={avgLead === null ? '-' : `${avgLead.toFixed(1)} 日`} sub={`完了 ${leadDays.length} 件から`} />
        <Tile label="不合格" value={results.find(([r]) => r === '不合格')?.[1] ?? 0} tone="warn" sub={`合格 ${results.find(([r]) => r === '合格')?.[1] ?? 0} / 条件付 ${results.find(([r]) => r === '条件付合格')?.[1] ?? 0}`} />
      </div>
      <div className="summary__tables">
        <BreakdownTable title="部門別" rows={byDept} cards={cards} data-testid="by-dept" />
        <BreakdownTable title="担当別(対応中)" rows={byAssignee} cards={open} />
        <div className="breakdown">
          <h3>納期超過</h3>
          {overdue.length === 0 ? (
            <p className="muted">ありません</p>
          ) : (
            <table className="mini">
              <tbody>
                {overdue
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{c.no}</td>
                      <td>{c.partNo || c.title}</td>
                      <td>{c.dept}</td>
                      <td className="num">{c.dueDate}</td>
                      <td className="num bad">{Math.round((Date.parse(today) - Date.parse(c.dueDate)) / DAY)} 日超過</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function groupCount(cards: RequestCardShape[], key: (c: RequestCardShape) => string): Array<[string, RequestCardShape[]]> {
  const m = new Map<string, RequestCardShape[]>()
  for (const c of cards) {
    const k = key(c)
    m.set(k, [...(m.get(k) ?? []), c])
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

function BreakdownTable({ title, rows, cards, ...rest }: { title: string; rows: Array<[string, RequestCardShape[]]>; cards: RequestCardShape[]; 'data-testid'?: string }): JSX.Element {
  const statuses = REQUEST_STATUSES.filter((s) => cards.some((c) => c.status === s))
  return (
    <div className="breakdown" data-testid={rest['data-testid']}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">データがありません</p>
      ) : (
        <table className="mini">
          <thead>
            <tr>
              <th></th>
              <th className="num">件数</th>
              {statuses.map((s) => (
                <th key={s} className="num">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, list]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="num">
                  <b>{list.length}</b>
                </td>
                {statuses.map((s) => (
                  <td key={s} className="num">
                    {list.filter((c) => c.status === s).length || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }): JSX.Element {
  return (
    <div className="tile" data-tone={tone}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {sub && <span className="tile__sub">{sub}</span>}
    </div>
  )
}

function Cell({
  column,
  value,
  readonly,
  status,
  onChange
}: {
  column: Column
  value: string
  readonly: boolean
  status: RequestStatus
  onChange: (v: string) => void
}): JSX.Element {
  if (column.kind === 'readonly' || readonly) {
    return <span className="grid__ro">{value || (column.kind === 'readonly' ? '-' : '')}</span>
  }
  if (column.kind === 'select' || column.kind === 'priority' || column.kind === 'result') {
    const opts = column.kind === 'select' ? REQUEST_STATUSES.filter((s) => canTransition(status, s)) : column.kind === 'priority' ? PRIORITIES : RESULTS
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} data-col={column.key}>
        {opts.map((s) => (
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

