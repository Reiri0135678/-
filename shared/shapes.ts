/**
 * ボード上の図形データの定義。クライアント(描画)とサーバー(同期・kintone)の両方から参照する。
 * Yjs の `shapes` マップに shapeId → Y.Map(この形の平坦なオブジェクト)で保持する。
 */
export const REQUEST_STATUSES = ['未受付', '受付', '検査中', '保留', '差戻し', '完了', '取消'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
/** 終了扱いの状態(アーカイブ対象) */
export const CLOSED_STATUSES: readonly RequestStatus[] = ['完了', '取消']
export const PRIORITIES = ['通常', '至急'] as const
export type Priority = (typeof PRIORITIES)[number]
export const RESULTS = ['未判定', '合格', '条件付合格', '不合格'] as const
export type InspectionResult = (typeof RESULTS)[number]

/**
 * 状態遷移ルール(現在の状態 → 移れる状態)。運用に合わせてここを書き換える。
 * - 差戻し: 情報不足で依頼者に返す。依頼者が直したら「受付」へ
 * - 保留: 一時停止。再開は「受付」または「検査中」
 * - 完了 → 検査中: 不合格の再検査など
 */
export const STATUS_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  未受付: ['受付', '差戻し', '取消'],
  受付: ['検査中', '保留', '差戻し', '取消'],
  検査中: ['完了', '保留', '差戻し', '受付'],
  保留: ['受付', '検査中', '取消'],
  差戻し: ['受付', '取消'],
  完了: ['検査中'],
  取消: ['未受付']
}
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return from === to || (STATUS_TRANSITIONS[from] ?? []).includes(to)
}

export type ShapeType =
  | 'draw'
  | 'text'
  | 'note'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'image'
  | 'frame'
  | 'table'
  | 'request-card'

export interface ShapeBase {
  id: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** 重なり順(大きいほど手前) */
  z: number
  /** 最後に触った人(監査用) */
  by: string
  updatedAt: number
  /** 所属ページ(省略時は最初のページ) */
  page: string
  /** ロック中は移動・変形・削除できない */
  locked: boolean
  /** グループ id(同じ id の図形はまとめて選択・移動される) */
  groupId: string | null
}

export const DEFAULT_PAGE = 'p1'
export type TextAlign = 'left' | 'center' | 'right'

export interface DrawShape extends ShapeBase {
  type: 'draw'
  /** 図形座標系の点列 [x0,y0,x1,y1,...] */
  points: number[]
  color: string
  size: number
  /** 蛍光ペンは半透明 */
  opacity: number
}
export interface TextShape extends ShapeBase {
  type: 'text'
  text: string
  color: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
}
export interface NoteShape extends ShapeBase {
  type: 'note'
  text: string
  color: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
}
/** 矢印の端点を図形に吸着させる情報。nx/ny は図形内の相対位置(0〜1) */
export interface ArrowBinding {
  id: string
  nx: number
  ny: number
}
export type LineDash = 'solid' | 'dashed' | 'dotted'
export interface ArrowShape extends ShapeBase {
  type: 'arrow'
  /** 始点は (x,y)、終点は (x+dx, y+dy) */
  dx: number
  dy: number
  color: string
  size: number
  /** 吸着先(無ければ null)。吸着先が動くと端点が追従する */
  startBind: ArrowBinding | null
  endBind: ArrowBinding | null
  dash: LineDash
  /** 矢頭。両方 false なら直線 */
  headStart: boolean
  headEnd: boolean
}
export type GeoKind = 'rect' | 'rounded' | 'triangle' | 'diamond' | 'hexagon'
export const GEO_KINDS: Array<{ kind: GeoKind; label: string }> = [
  { kind: 'rect', label: '四角' },
  { kind: 'rounded', label: '角丸' },
  { kind: 'triangle', label: '三角' },
  { kind: 'diamond', label: 'ひし形' },
  { kind: 'hexagon', label: '六角' }
]
export interface RectShape extends ShapeBase {
  type: 'rect'
  kind: GeoKind
  color: string
  fill: string
  size: number
  dash: LineDash
  /** 図形の中に置く文字 */
  label: string
  fontSize: number
}
export interface EllipseShape extends ShapeBase {
  type: 'ellipse'
  color: string
  fill: string
  size: number
  dash: LineDash
  label: string
  fontSize: number
}
export interface ImageShape extends ShapeBase {
  type: 'image'
  src: string
  name: string
  /** 元画像のピクセル座標での切り抜き範囲。無ければ全体 */
  crop: { x: number; y: number; w: number; h: number } | null
}
/** 表: 行×列の文字セル。列幅・行高は個別に持つ(w/h はその合計) */
export interface TableShape extends ShapeBase {
  type: 'table'
  cells: string[][]
  colWidths: number[]
  rowHeights: number[]
  headerRow: boolean
  color: string
  fontSize: number
}
/** 区画: 名前付きの領域。動かすと中の図形も一緒に動く。常に背面 */
export interface FrameShape extends ShapeBase {
  type: 'frame'
  title: string
  color: string
}
export interface RequestCardShape extends ShapeBase {
  type: 'request-card'
  /** 受付番号(サーバーが採番。例 QC-2026-0001)。人が参照する主キー */
  no: string
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  status: RequestStatus
  /** 依頼者名(カード作成時のユーザー名を自動記録) */
  requester: string
  /** 依頼日 YYYY-MM-DD */
  requestedAt: string
  /** 備考・検査項目のメモ */
  note: string
  /** 担当検査員 */
  assignee: string
  /** 希望納期 YYYY-MM-DD */
  dueDate: string
  priority: Priority
  /** 検査結果 */
  result: InspectionResult
  /** 測定値・所見など */
  resultNote: string
  judgedBy: string
  /** 判定日 YYYY-MM-DD */
  judgedAt: string
  /** ボードから外した(一覧・kintone には残る) */
  archived: boolean
  /** 紐付けた図面・写真(画像図形)の id */
  linkedShapeIds: string[]
  /** kintone 連携済みならレコード番号。未連携は空文字 */
  kintoneRecordId: string
}

export type Shape =
  | DrawShape
  | TextShape
  | NoteShape
  | ArrowShape
  | RectShape
  | EllipseShape
  | ImageShape
  | FrameShape
  | TableShape
  | RequestCardShape

export const CARD_W = 220
export const CARD_H = 148

/** ペン・図形の色(落ち着いた暖色系のパレット) */
export const DEFAULT_COLOR = '#141413'
export const COLORS = ['#141413', '#b5462b', '#3f6f9e', '#5f7a45', '#d97757', '#7b5c9c'] as const
/** 付箋の色(紙色) */
export const NOTE_COLORS = ['#f7ebcf', '#dfe9f2', '#e4e9d9', '#f3dcd4'] as const
export const HIGHLIGHT_COLOR = '#f2d16b'

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ShapeDefaults = DistributiveOmit<Shape, 'id' | 'x' | 'y' | 'z' | 'by' | 'updatedAt'>

/** 型ごとの既定値(id / 座標 / z / by / updatedAt は作成時に埋める) */
export function defaultsFor(type: ShapeType): ShapeDefaults {
  const base = { w: 0, h: 0, rotation: 0, page: DEFAULT_PAGE, locked: false, groupId: null as string | null }
  switch (type) {
    case 'draw':
      return { ...base, type, points: [], color: DEFAULT_COLOR, size: 3, opacity: 1 }
    case 'text':
      return { ...base, type, w: 200, h: 28, text: '', color: DEFAULT_COLOR, fontSize: 18, bold: false, italic: false, underline: false, align: 'left' }
    case 'note':
      return { ...base, type, w: 180, h: 180, text: '', color: NOTE_COLORS[0], fontSize: 18, bold: false, italic: false, underline: false, align: 'left' }
    case 'arrow':
      return { ...base, type, dx: 100, dy: 0, color: DEFAULT_COLOR, size: 3, startBind: null, endBind: null, dash: 'solid', headStart: false, headEnd: true }
    case 'rect':
      return { ...base, type, kind: 'rect', w: 120, h: 80, color: DEFAULT_COLOR, fill: 'transparent', size: 2, dash: 'solid', label: '', fontSize: 16 }
    case 'ellipse':
      return { ...base, type, w: 120, h: 80, color: DEFAULT_COLOR, fill: 'transparent', size: 2, dash: 'solid', label: '', fontSize: 16 }
    case 'image':
      return { ...base, type, w: 200, h: 150, src: '', name: '', crop: null }
    case 'frame':
      return { ...base, type, w: 600, h: 400, title: '区画', color: '#6a9bcc' }
    case 'table':
      return {
        ...base,
        type,
        w: 360,
        h: 120,
        cells: [
          ['項目', '基準', '結果'],
          ['', '', ''],
          ['', '', '']
        ],
        colWidths: [120, 120, 120],
        rowHeights: [40, 40, 40],
        headerRow: true,
        color: DEFAULT_COLOR,
        fontSize: 14
      }
    case 'request-card':
      return {
        ...base,
        type,
        w: CARD_W,
        h: CARD_H,
        no: '',
        title: '検査依頼',
        dept: '製造1課',
        partNo: '',
        lot: '',
        qty: '',
        status: '未受付',
        requester: '',
        requestedAt: '',
        note: '',
        assignee: '',
        dueDate: '',
        priority: '通常',
        result: '未判定',
        resultNote: '',
        judgedBy: '',
        judgedAt: '',
        archived: false,
        linkedShapeIds: [],
        kintoneRecordId: ''
      }
  }
}

/** 保存データから読み込んだ図形の欠損項目を既定値で補う(古い版との互換) */
export function normalizeShape(raw: Record<string, unknown>): Shape | null {
  const type = raw['type'] as ShapeType
  if (!type || typeof raw['id'] !== 'string') return null
  try {
    const d = defaultsFor(type)
    return {
      ...d,
      ...raw,
      x: Number(raw['x'] ?? 0),
      y: Number(raw['y'] ?? 0),
      z: Number(raw['z'] ?? 0),
      by: String(raw['by'] ?? ''),
      updatedAt: Number(raw['updatedAt'] ?? 0),
      page: String(raw['page'] || DEFAULT_PAGE),
      locked: raw['locked'] === true,
      groupId: typeof raw['groupId'] === 'string' ? raw['groupId'] : null
    } as Shape
  } catch {
    return null
  }
}

/** 今日の日付を YYYY-MM-DD で返す(ローカル時刻) */
export function todayString(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---- kintone 連携・CSV 用の平坦なレコード --------------------------------
export interface RequestRecord {
  shapeId: string
  boardName: string
  no: string
  title: string
  dept: string
  partNo: string
  lot: string
  qty: string
  status: RequestStatus
  requester: string
  requestedAt: string
  note: string
  assignee: string
  dueDate: string
  priority: Priority
  result: InspectionResult
  resultNote: string
  judgedBy: string
  judgedAt: string
  archived: boolean
  kintoneRecordId: string
}

export const REQUEST_RECORD_COLUMNS: Array<{ key: keyof RequestRecord; label: string }> = [
  { key: 'no', label: '受付番号' },
  { key: 'status', label: '状態' },
  { key: 'priority', label: '優先度' },
  { key: 'title', label: '件名' },
  { key: 'dept', label: '依頼部門' },
  { key: 'partNo', label: '品番' },
  { key: 'lot', label: 'ロット' },
  { key: 'qty', label: '数量' },
  { key: 'requester', label: '依頼者' },
  { key: 'requestedAt', label: '依頼日' },
  { key: 'dueDate', label: '希望納期' },
  { key: 'assignee', label: '担当' },
  { key: 'note', label: '備考' },
  { key: 'result', label: '結果' },
  { key: 'resultNote', label: '所見' },
  { key: 'judgedBy', label: '判定者' },
  { key: 'judgedAt', label: '判定日' },
  { key: 'archived', label: 'アーカイブ' },
  { key: 'kintoneRecordId', label: 'kintone' },
  { key: 'boardName', label: 'ボード' },
  { key: 'shapeId', label: 'ID' }
]

export function toRequestRecord(card: RequestCardShape, boardName: string): RequestRecord {
  return {
    shapeId: card.id,
    boardName,
    no: card.no,
    title: card.title,
    dept: card.dept,
    partNo: card.partNo,
    lot: card.lot,
    qty: card.qty,
    status: card.status,
    requester: card.requester,
    requestedAt: card.requestedAt,
    note: card.note,
    assignee: card.assignee,
    dueDate: card.dueDate,
    priority: card.priority,
    result: card.result,
    resultNote: card.resultNote,
    judgedBy: card.judgedBy,
    judgedAt: card.judgedAt,
    archived: card.archived,
    kintoneRecordId: card.kintoneRecordId
  }
}

/** Excel で開ける CSV(BOM 付き UTF-8) */
export function toCsv(records: RequestRecord[]): string {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = REQUEST_RECORD_COLUMNS.map((c) => esc(c.label)).join(',')
  const rows = records.map((r) =>
    REQUEST_RECORD_COLUMNS.map((c) => esc(typeof r[c.key] === 'boolean' ? (r[c.key] ? '1' : '') : String(r[c.key]))).join(',')
  )
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}

// ---- 変更履歴 ----------------------------------------------------------
export interface HistoryEntry {
  ts: number
  user: string
  shapeId: string
  shapeType: ShapeType
  action: 'create' | 'update' | 'delete'
  /** 変更後の値(update は変わった項目のみ) */
  fields: Record<string, unknown>
  /** 受付番号(カードのとき) */
  no?: string
}

// ---- CSV 取り込み(紙・Excel からの移行用) ------------------------------
/** RFC4180 風の CSV を行×列に分解する(BOM・引用符・改行入りセル対応) */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** 取り込める列(見出し名 → 項目)。CSV 出力と同じ日本語見出しに加え、英語キーも受け付ける */
const IMPORT_ALIASES: Record<string, keyof RequestRecord> = Object.fromEntries([
  ...REQUEST_RECORD_COLUMNS.map((c) => [c.label, c.key] as const),
  ...REQUEST_RECORD_COLUMNS.map((c) => [c.key, c.key] as const),
  ['部門', 'dept'],
  ['納期', 'dueDate'],
  ['担当者', 'assignee'],
  ['検査結果', 'result'],
  ['メモ', 'note']
])

export interface ImportedRow {
  no: string
  fields: Partial<RequestCardShape>
}

/** CSV の行を依頼カードの項目に写す。先頭行は見出し。不明な列は無視 */
export function csvToRequests(rows: string[][]): { rows: ImportedRow[]; unknownHeaders: string[] } {
  if (rows.length === 0) return { rows: [], unknownHeaders: [] }
  const header = rows[0]!.map((h) => h.trim())
  const keys = header.map((h) => IMPORT_ALIASES[h])
  const unknownHeaders = header.filter((h, i) => !keys[i] && h)
  const out: ImportedRow[] = []
  for (const r of rows.slice(1)) {
    const fields: Partial<RequestCardShape> = {}
    let no = ''
    keys.forEach((k, i) => {
      const v = (r[i] ?? '').trim()
      if (!k || v === '') return
      switch (k) {
        case 'no':
          no = v
          break
        case 'status':
          if ((REQUEST_STATUSES as readonly string[]).includes(v)) fields.status = v as RequestStatus
          break
        case 'priority':
          if ((PRIORITIES as readonly string[]).includes(v)) fields.priority = v as Priority
          break
        case 'result':
          if ((RESULTS as readonly string[]).includes(v)) fields.result = v as InspectionResult
          break
        case 'requestedAt':
        case 'dueDate':
        case 'judgedAt':
          fields[k] = normalizeDate(v)
          break
        case 'archived':
          fields.archived = v === '1' || v.toLowerCase() === 'true'
          break
        case 'shapeId':
        case 'boardName':
        case 'kintoneRecordId':
          break
        default:
          fields[k] = v
      }
    })
    if (Object.keys(fields).length === 0 && !no) continue
    out.push({ no, fields })
  }
  return { rows: out, unknownHeaders }
}

/** 2026/9/5, 2026-09-05, 9/5/2026 などを YYYY-MM-DD に寄せる。解釈できなければ空 */
export function normalizeDate(v: string): string {
  const m1 = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2]!.padStart(2, '0')}-${m1[3]!.padStart(2, '0')}`
  const m2 = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m2) return `${m2[3]}-${m2[1]!.padStart(2, '0')}-${m2[2]!.padStart(2, '0')}`
  return ''
}

// ---- ページ・コメント ----------------------------------------------------
export interface PageInfo {
  id: string
  name: string
  order: number
}

export interface CommentReply {
  author: string
  text: string
  ts: number
}
export interface CommentThread {
  id: string
  page: string
  /** 図形に付いたコメントなら図形 id。無ければ座標に置く */
  shapeId: string | null
  x: number
  y: number
  author: string
  text: string
  ts: number
  resolved: boolean
  replies: CommentReply[]
}

export function normalizeComment(raw: Record<string, unknown>): CommentThread | null {
  if (typeof raw['id'] !== 'string') return null
  return {
    id: raw['id'],
    page: String(raw['page'] || DEFAULT_PAGE),
    shapeId: typeof raw['shapeId'] === 'string' ? raw['shapeId'] : null,
    x: Number(raw['x'] ?? 0),
    y: Number(raw['y'] ?? 0),
    author: String(raw['author'] ?? ''),
    text: String(raw['text'] ?? ''),
    ts: Number(raw['ts'] ?? 0),
    resolved: raw['resolved'] === true,
    replies: Array.isArray(raw['replies']) ? (raw['replies'] as CommentReply[]) : []
  }
}

/** 線種のダッシュ配列(太さに比例) */
export function dashArray(dash: LineDash, size: number): number[] | undefined {
  if (dash === 'dashed') return [size * 4, size * 3]
  if (dash === 'dotted') return [size, size * 2]
  return undefined
}

/** クリップボード用の包み。他アプリのテキストと区別するための印 */
export const CLIPBOARD_MARK = 'qc-board/shapes'

/** 区画の中に入っている図形(外接枠が区画に収まるもの) */
export function shapesInFrame(frame: FrameShape, all: Shape[]): Shape[] {
  return all.filter((s) => {
    if (s.id === frame.id || s.type === 'frame' || s.page !== frame.page) return false
    const b = s.type === 'arrow' ? { x: Math.min(s.x, s.x + s.dx), y: Math.min(s.y, s.y + s.dy), w: Math.abs(s.dx), h: Math.abs(s.dy) } : { x: s.x, y: s.y, w: s.w, h: s.h }
    return b.x >= frame.x && b.y >= frame.y && b.x + b.w <= frame.x + frame.w && b.y + b.h <= frame.y + frame.h
  })
}

// ---- 版(スナップショット) ----------------------------------------------
export interface VersionInfo {
  id: string
  name: string
  by: string
  ts: number
  shapes: number
}

/** 表の寸法をセルの幅・高さから求める */
export function tableSize(t: Pick<TableShape, 'colWidths' | 'rowHeights'>): { w: number; h: number } {
  return { w: t.colWidths.reduce((a, b) => a + b, 0), h: t.rowHeights.reduce((a, b) => a + b, 0) }
}

// ---- 自作の雛形 -----------------------------------------------------------
export interface UserTemplate {
  id: string
  name: string
  by: string
  ts: number
  /** 左上を原点にした相対座標の図形 */
  shapes: Array<Partial<Shape> & { type: ShapeType; id?: string }>
}
