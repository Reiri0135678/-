import type { JSX } from 'react'
import { CLOSED_STATUSES, REQUEST_STATUSES, RESULTS, type RequestCardShape } from '@shared/shapes'
import { DAY, dueState } from './sheetColumns'

/** 集計ビュー: 状態別・部門別の件数、リードタイム、納期、担当別の持ち件数 */
export function Summary({ cards, today }: { cards: RequestCardShape[]; today: string }): JSX.Element {
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
