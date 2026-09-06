import { PRIORITIES, REQUEST_STATUSES, RESULTS, canTransition, normalizeDate, type Priority, type RequestCardShape, type RequestRecord } from '@shared/shapes'
import type { Column } from './sheetColumns'

export interface CellPos {
  r: number
  c: number
}
export interface CellRange {
  anchor: CellPos
  focus: CellPos
}
export interface RangeRect {
  r0: number
  r1: number
  c0: number
  c1: number
}

export function rectOf(range: CellRange | null): RangeRect | null {
  if (!range) return null
  return {
    r0: Math.min(range.anchor.r, range.focus.r),
    r1: Math.max(range.anchor.r, range.focus.r),
    c0: Math.min(range.anchor.c, range.focus.c),
    c1: Math.max(range.anchor.c, range.focus.c)
  }
}

export function isMulti(rect: RangeRect | null): rect is RangeRect {
  return !!rect && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1)
}

/** 範囲の値をタブ区切り(Excel に貼れる形)にする */
export function toTsv(rect: RangeRect, rows: RequestRecord[], cols: Column[]): string {
  const lines: string[] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rec = rows[r]
    if (!rec) break
    lines.push(
      cols
        .slice(rect.c0, rect.c1 + 1)
        .map((c) => String(rec[c.key] ?? '').replace(/[\t\r\n]/g, ' '))
        .join('\t')
    )
  }
  return lines.join('\n')
}

/** タブ区切り / 改行区切りの文字列を 2 次元配列に。末尾の空行は捨てる */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((l) => l.split('\t'))
}

/**
 * 貼り付けた値を列の種類に合わせて検証し、カードへの patch にする。
 * 受け付けない値(読み取り専用列、移れない状態、未知の優先度など)は null を返して飛ばす
 */
export function coerceCell(col: Column, raw: string, card: RequestCardShape, judge: { by: string; at: string }): Partial<RequestCardShape> | null {
  const v = raw.trim()
  switch (col.kind) {
    case 'readonly':
      return null
    case 'select': {
      const s = REQUEST_STATUSES.find((x) => x === v)
      return s && canTransition(card.status, s) ? { status: s } : null
    }
    case 'priority':
      return PRIORITIES.includes(v as Priority) ? { priority: v as Priority } : null
    case 'result': {
      const rs = RESULTS.find((x) => x === v)
      if (!rs) return null
      return rs === '未判定' ? { result: rs, judgedBy: '', judgedAt: '' } : { result: rs, judgedBy: judge.by, judgedAt: judge.at }
    }
    case 'date': {
      if (v === '') return { [col.key]: '' } as Partial<RequestCardShape>
      const d = normalizeDate(v)
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? ({ [col.key]: d } as Partial<RequestCardShape>) : null
    }
    default:
      return { [col.key]: v.slice(0, 2000) } as Partial<RequestCardShape>
  }
}

/**
 * 貼り付けを適用する patch の一覧を作る。
 * - 1 値だけ貼ると、選択範囲全体をその値で埋める(Excel と同じ)
 * - 複数値は start を左上として並べ、行・列が足りない分は捨てる
 */
export function pastePatches(
  grid: string[][],
  start: CellPos,
  rect: RangeRect | null,
  rows: RequestCardShape[],
  cols: Column[],
  judge: { by: string; at: string }
): Array<{ id: string; patch: Partial<RequestCardShape> }> {
  const single = grid.length === 1 && grid[0]!.length === 1
  const fill = single && isMulti(rect) ? rect : null
  const out = new Map<string, Partial<RequestCardShape>>()
  const put = (r: number, c: number, raw: string) => {
    const card = rows[r]
    const col = cols[c]
    if (!card || !col) return
    const patch = coerceCell(col, raw, card, judge)
    if (!patch) return
    out.set(card.id, { ...(out.get(card.id) ?? {}), ...patch })
  }
  if (fill) {
    for (let r = fill.r0; r <= fill.r1; r++) for (let c = fill.c0; c <= fill.c1; c++) put(r, c, grid[0]![0]!)
  } else {
    grid.forEach((line, i) => line.forEach((raw, j) => put(start.r + i, start.c + j, raw)))
  }
  return [...out.entries()].map(([id, patch]) => ({ id, patch }))
}
