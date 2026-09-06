import type { JSX } from 'react'
import { PRIORITIES, REQUEST_STATUSES, RESULTS, canTransition, type RequestStatus } from '@shared/shapes'
import type { Column } from './sheetColumns'

/** 一覧のセル。列の種類に応じて select / input / 読み取り専用の表示に分ける */
export function Cell({
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

