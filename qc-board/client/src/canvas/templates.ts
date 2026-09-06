import type { Shape, ShapeType } from '@shared/shapes'

export type TemplateShape = Partial<Shape> & { type: ShapeType; id?: string }
export interface Template {
  id: string
  name: string
  description: string
  build: () => TemplateShape[]
}

const NOTE = (id: string, x: number, y: number, text: string, color = '#f7ebcf'): TemplateShape => ({ id, type: 'note', x, y, w: 180, h: 120, text, color, fontSize: 16 })
const BOX = (id: string, x: number, y: number, label: string, kind: 'rect' | 'rounded' | 'diamond' | 'hexagon' = 'rounded', color = '#3f6f9e'): TemplateShape => ({ id, type: 'rect', x, y, w: 150, h: 70, kind, label, color, fill: `${color}18`, fontSize: 15 } as TemplateShape)
const ARROW = (from: string, to: string, fx = 1, fy = 0.5, tx = 0, ty = 0.5, extra: Partial<Shape> = {}): TemplateShape =>
  ({ type: 'arrow', x: 0, y: 0, dx: 1, dy: 1, startBind: { id: from, nx: fx, ny: fy }, endBind: { id: to, nx: tx, ny: ty }, color: '#141413', ...extra }) as TemplateShape
const FRAME = (id: string, x: number, y: number, w: number, h: number, title: string, color = '#6a9bcc'): TemplateShape => ({ id, type: 'frame', x, y, w, h, title, color })
const TEXT = (x: number, y: number, text: string, fontSize = 22): TemplateShape => ({ type: 'text', x, y, w: 500, h: 30, text, fontSize, bold: true } as TemplateShape)

/** 現場で使う定番の雛形。挿入位置は画面中央 */
export const TEMPLATES: Template[] = [
  {
    id: 'flow',
    name: '検査工程フロー',
    description: '受入 → 外観 → 寸法 → 判定 → 合格 / 不合格',
    build: () => [
      TEXT(0, -60, '検査工程フロー'),
      BOX('a', 0, 0, '受入'),
      BOX('b', 220, 0, '外観検査'),
      BOX('c', 440, 0, '寸法検査'),
      BOX('d', 660, -10, '判定', 'diamond', '#d97757'),
      BOX('e', 900, -80, '合格 → 出荷', 'hexagon', '#5f7a45'),
      BOX('f', 900, 80, '不合格 → 再検査 / 処置', 'hexagon', '#b5462b'),
      ARROW('a', 'b'),
      ARROW('b', 'c'),
      ARROW('c', 'd'),
      ARROW('d', 'e', 1, 0.5, 0, 0.5),
      ARROW('d', 'f', 1, 0.5, 0, 0.5, { dash: 'dashed' } as Partial<Shape>)
    ]
  },
  {
    id: '5w1h',
    name: '5W1H',
    description: '何を・なぜ・誰が・いつ・どこで・どのように',
    build: () => {
      const items = [
        ['What', '何を(対象・現象)'],
        ['Why', 'なぜ(目的・理由)'],
        ['Who', '誰が(担当・関係者)'],
        ['When', 'いつ(時期・期限)'],
        ['Where', 'どこで(場所・工程)'],
        ['How', 'どのように(方法・手順)']
      ]
      return [
        TEXT(0, -60, '5W1H'),
        ...items.flatMap(([en, ja], i) => {
          const x = (i % 3) * 340
          const y = Math.floor(i / 3) * 280
          return [FRAME(`f${i}`, x, y, 320, 250, `${en} ${ja}`), NOTE(`n${i}`, x + 20, y + 30, '', '#fffefb')]
        })
      ]
    }
  },
  {
    id: 'why5',
    name: 'なぜなぜ分析',
    description: '事象 → なぜ×5 → 真因 → 対策',
    build: () => [
      TEXT(0, -60, 'なぜなぜ分析'),
      NOTE('e', 0, 0, '事象:\n', '#f3dcd4'),
      ...[1, 2, 3, 4, 5].map((n) => NOTE(`w${n}`, n * 220, 0, `なぜ${n}:\n`)),
      NOTE('r', 6 * 220, 0, '真因:\n', '#dfe9f2'),
      NOTE('c', 6 * 220, 160, '対策:\n', '#e4e9d9'),
      ARROW('e', 'w1'),
      ARROW('w1', 'w2'),
      ARROW('w2', 'w3'),
      ARROW('w3', 'w4'),
      ARROW('w4', 'w5'),
      ARROW('w5', 'r'),
      ARROW('r', 'c', 0.5, 1, 0.5, 0)
    ]
  },
  {
    id: '4m',
    name: '4M 変化点',
    description: '人・設備・材料・方法の変化点を整理',
    build: () => [
      TEXT(0, -60, '4M 変化点'),
      FRAME('m1', 0, 0, 360, 260, 'Man(人)', '#3f6f9e'),
      FRAME('m2', 400, 0, 360, 260, 'Machine(設備)', '#5f7a45'),
      FRAME('m3', 0, 300, 360, 260, 'Material(材料)', '#d97757'),
      FRAME('m4', 400, 300, 360, 260, 'Method(方法)', '#7b5c9c'),
      NOTE('n1', 20, 30, '変化点:\n影響:\n対応:', '#fffefb'),
      NOTE('n2', 420, 30, '変化点:\n影響:\n対応:', '#fffefb'),
      NOTE('n3', 20, 330, '変化点:\n影響:\n対応:', '#fffefb'),
      NOTE('n4', 420, 330, '変化点:\n影響:\n対応:', '#fffefb')
    ]
  },
  {
    id: 'pdca',
    name: 'PDCA',
    description: '計画・実行・確認・処置の4区画',
    build: () => [
      TEXT(0, -60, 'PDCA'),
      FRAME('p', 0, 0, 380, 280, 'Plan(計画)', '#3f6f9e'),
      FRAME('d', 420, 0, 380, 280, 'Do(実行)', '#5f7a45'),
      FRAME('c', 420, 320, 380, 280, 'Check(確認)', '#d97757'),
      FRAME('a', 0, 320, 380, 280, 'Act(処置)', '#7b5c9c')
    ]
  },
  {
    id: 'fishbone',
    name: '特性要因図(4M)',
    description: '特性に対する要因を 4M で整理',
    build: () => [
      TEXT(0, -80, '特性要因図'),
      { id: 'spine', type: 'arrow', x: 0, y: 200, dx: 900, dy: 0, color: '#141413', size: 4, headEnd: true } as TemplateShape,
      BOX('t', 920, 165, '特性(問題)', 'rect', '#b5462b'),
      { type: 'arrow', x: 150, y: 40, dx: 150, dy: 160, color: '#3f6f9e' } as TemplateShape,
      { type: 'arrow', x: 550, y: 40, dx: 150, dy: 160, color: '#5f7a45' } as TemplateShape,
      { type: 'arrow', x: 150, y: 360, dx: 150, dy: -160, color: '#d97757' } as TemplateShape,
      { type: 'arrow', x: 550, y: 360, dx: 150, dy: -160, color: '#7b5c9c' } as TemplateShape,
      BOX('b1', 50, -10, 'Man(人)', 'rounded', '#3f6f9e'),
      BOX('b2', 450, -10, 'Machine(設備)', 'rounded', '#5f7a45'),
      BOX('b3', 50, 350, 'Material(材料)', 'rounded', '#d97757'),
      BOX('b4', 450, 350, 'Method(方法)', 'rounded', '#7b5c9c')
    ]
  },
  {
    id: 'countermeasure',
    name: '不良対策シート',
    description: '現象・原因・応急処置・恒久対策・効果確認',
    build: () => {
      const cols = ['現象', '原因', '応急処置', '恒久対策', '効果確認']
      const colors = ['#b5462b', '#d97757', '#3f6f9e', '#5f7a45', '#7b5c9c']
      return [TEXT(0, -60, '不良対策シート'), ...cols.map((c, i) => FRAME(`c${i}`, i * 260, 0, 240, 420, c, colors[i]!))]
    }
  }
]
