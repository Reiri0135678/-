import { tableSize, type TableShape } from '@shared/shapes'

/** 表の編集。図形は変えず、updateShape に渡す差分だけを返す(できない操作は null) */

export function setCellPatch(t: TableShape, r: number, c: number, text: string): Partial<TableShape> | null {
  if (!t.cells[r] || t.cells[r]![c] === undefined) return null
  const cells = t.cells.map((row) => [...row])
  cells[r]![c] = text
  return { cells }
}

export function insertRowPatch(t: TableShape, at = t.cells.length): Partial<TableShape> {
  const cells = [...t.cells]
  cells.splice(at, 0, new Array<string>(t.colWidths.length).fill(''))
  const rowHeights = [...t.rowHeights]
  rowHeights.splice(at, 0, t.rowHeights[t.rowHeights.length - 1] ?? 40)
  return { cells, rowHeights, ...tableSize({ colWidths: t.colWidths, rowHeights }) }
}

export function deleteRowPatch(t: TableShape, at = t.cells.length - 1): Partial<TableShape> | null {
  if (t.cells.length <= 1) return null
  const cells = t.cells.filter((_, r) => r !== at)
  const rowHeights = t.rowHeights.filter((_, r) => r !== at)
  return { cells, rowHeights, ...tableSize({ colWidths: t.colWidths, rowHeights }) }
}

export function insertColPatch(t: TableShape, at = t.colWidths.length): Partial<TableShape> {
  const cells = t.cells.map((row) => {
    const r = [...row]
    r.splice(at, 0, '')
    return r
  })
  const colWidths = [...t.colWidths]
  colWidths.splice(at, 0, t.colWidths[t.colWidths.length - 1] ?? 120)
  return { cells, colWidths, ...tableSize({ colWidths, rowHeights: t.rowHeights }) }
}

export function deleteColPatch(t: TableShape, at = t.colWidths.length - 1): Partial<TableShape> | null {
  if (t.colWidths.length <= 1) return null
  const cells = t.cells.map((row) => row.filter((_, c) => c !== at))
  const colWidths = t.colWidths.filter((_, c) => c !== at)
  return { cells, colWidths, ...tableSize({ colWidths, rowHeights: t.rowHeights }) }
}
