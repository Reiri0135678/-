import type { JSX } from 'react'
import { COLORS, GEO_KINDS, NOTE_COLORS, type ArrowShape, type ImageShape, type LineDash, type TableShape, type TextAlign } from '@shared/shapes'
import { loadImageSize } from './useImage'
import { useEditor, useEditorSnapshot } from './hooks'

const SIZES: Array<{ label: string; value: number }> = [
  { label: 'S', value: 2 },
  { label: 'M', value: 3 },
  { label: 'L', value: 6 }
]
const FONT_SIZES = [14, 18, 24, 32]

/** 右上のスタイルパネル: 色・太さ・付箋色・塗り・文字装飾・グループ・ロック。選択中の図形にも即時適用 */
export function StylePanel(): JSX.Element | null {
  const editor = useEditor()
  const snap = useEditorSnapshot(editor)
  if (snap.readonly) return null
  const sel = editor.getSelectedShapes()
  const types = new Set(sel.map((s) => s.type))
  const showNote = snap.tool === 'note' || types.has('note')
  const showText = snap.tool === 'text' || snap.tool === 'note' || types.has('text') || types.has('note')
  const showFill = snap.tool === 'rect' || snap.tool === 'ellipse' || types.has('rect') || types.has('ellipse')
  const showColor = !(showNote && types.size === 1 && sel.length > 0) || sel.length === 0
  const anyLocked = sel.some((s) => s.locked)
  const anyGrouped = sel.some((s) => s.groupId)
  const showDash = ['arrow', 'line', 'rect', 'ellipse'].includes(snap.tool) || types.has('arrow') || types.has('rect') || types.has('ellipse')
  const showKind = snap.tool === 'rect' || types.has('rect')
  const arrows = sel.filter((s): s is ArrowShape => s.type === 'arrow')
  const showHeads = snap.tool === 'arrow' || snap.tool === 'line' || arrows.length > 0
  const heads = arrows[0] ? (arrows[0].headStart && arrows[0].headEnd ? 'both' : arrows[0].headEnd ? 'end' : arrows[0].headStart ? 'start' : 'none') : snap.tool === 'line' ? 'none' : 'end'
  const setHeads = (h: 'none' | 'end' | 'both') => {
    editor.updateShapes(arrows.map((a) => ({ id: a.id, patch: { headStart: h === 'both', headEnd: h !== 'none' } })))
    if (arrows.length === 0) editor.setTool(h === 'none' ? 'line' : 'arrow')
  }
  // 選択中の文字図形の装飾(混在時は既定値)
  const first = sel.find((s) => s.type === 'text' || s.type === 'note') as { bold: boolean; italic: boolean; underline: boolean; align: TextAlign; fontSize: number } | undefined
  const t = first ?? snap.style
  return (
    <div className="style-panel" data-testid="style-panel">
      {showColor && (
        <div className="style-panel__row">
          {COLORS.map((c) => (
            <button key={c} className="swatch" data-active={snap.style.color === c} style={{ background: c }} title={c} onClick={() => editor.setStyle({ color: c })} />
          ))}
        </div>
      )}
      <div className="style-panel__row">
        {SIZES.map((s) => (
          <button key={s.label} className="chip" data-active={snap.style.size === s.value} onClick={() => editor.setStyle({ size: s.value })}>
            {s.label}
          </button>
        ))}
        {showFill && (
          <button
            className="chip"
            data-active={snap.style.fill !== 'transparent'}
            title="塗りつぶし"
            onClick={() => editor.setStyle({ fill: snap.style.fill === 'transparent' ? `${snap.style.color}22` : 'transparent' })}
          >
            塗り
          </button>
        )}
      </div>
      {showNote && (
        <div className="style-panel__row">
          {NOTE_COLORS.map((c) => (
            <button key={c} className="swatch swatch--note" data-active={snap.style.noteColor === c} style={{ background: c }} onClick={() => editor.setStyle({ noteColor: c })} />
          ))}
        </div>
      )}
      {showDash && (
        <div className="style-panel__row" data-testid="dash-row">
          {(['solid', 'dashed', 'dotted'] as LineDash[]).map((d) => (
            <button key={d} className="chip" data-active={(sel.find((x) => 'dash' in x) as { dash?: LineDash } | undefined)?.dash === d || (!sel.some((x) => 'dash' in x) && snap.style.dash === d)} onClick={() => editor.setStyle({ dash: d })} data-dash={d} title={d === 'solid' ? '実線' : d === 'dashed' ? '破線' : '点線'}>
              {d === 'solid' ? '━' : d === 'dashed' ? '╌' : '┈'}
            </button>
          ))}
          {showHeads && (
            <>
              <span className="style-panel__gap" />
              {(['none', 'end', 'both'] as const).map((h) => (
                <button key={h} className="chip" data-active={heads === h} onClick={() => setHeads(h)} data-heads={h} title={h === 'none' ? '矢頭なし' : h === 'end' ? '終点に矢頭' : '両端に矢頭'}>
                  {h === 'none' ? '—' : h === 'end' ? '→' : '↔'}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {showKind && (
        <div className="style-panel__row" data-testid="kind-row">
          {GEO_KINDS.map((g) => (
            <button key={g.kind} className="chip" data-active={(sel.find((x) => x.type === 'rect') as { kind?: string } | undefined)?.kind === g.kind || (!types.has('rect') && snap.style.geoKind === g.kind)} onClick={() => editor.setStyle({ geoKind: g.kind })} data-kind={g.kind}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {showText && (
        <>
          <div className="style-panel__row" data-testid="text-style">
            <button className="chip chip--b" data-active={t.bold} title="太字" onClick={() => editor.setStyle({ bold: !t.bold })} data-style="bold">
              B
            </button>
            <button className="chip chip--i" data-active={t.italic} title="斜体" onClick={() => editor.setStyle({ italic: !t.italic })} data-style="italic">
              I
            </button>
            <button className="chip chip--u" data-active={t.underline} title="下線" onClick={() => editor.setStyle({ underline: !t.underline })} data-style="underline">
              U
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className="chip" data-active={t.align === a} title={a === 'left' ? '左揃え' : a === 'center' ? '中央' : '右揃え'} onClick={() => editor.setStyle({ align: a })} data-align={a}>
                {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
              </button>
            ))}
          </div>
          <div className="style-panel__row">
            {FONT_SIZES.map((f) => (
              <button key={f} className="chip" data-active={t.fontSize === f} onClick={() => editor.setStyle({ fontSize: f })} data-font-size={f}>
                {f}
              </button>
            ))}
          </div>
        </>
      )}
      {sel.length === 1 && sel[0]!.type === 'table' && (
        <div className="style-panel__row" data-testid="table-row">
          <button className="chip" onClick={() => editor.tableInsertRow(sel[0]!.id)} title="行を追加" data-table="row+">
            行+
          </button>
          <button className="chip" onClick={() => editor.tableDeleteRow(sel[0]!.id)} title="最後の行を削除" data-table="row-">
            行−
          </button>
          <button className="chip" onClick={() => editor.tableInsertCol(sel[0]!.id)} title="列を追加" data-table="col+">
            列+
          </button>
          <button className="chip" onClick={() => editor.tableDeleteCol(sel[0]!.id)} title="最後の列を削除" data-table="col-">
            列−
          </button>
          <button className="chip" data-active={(sel[0] as TableShape).headerRow} onClick={() => editor.updateShape<TableShape>(sel[0]!.id, { headerRow: !(sel[0] as TableShape).headerRow })} title="1 行目を見出しにする" data-table="header">
            見出し
          </button>
        </div>
      )}
      {sel.length === 1 && sel[0]!.type === 'image' && (
        <div className="style-panel__row" data-testid="image-row">
          {snap.cropping === sel[0]!.id ? (
            <>
              <button className="chip" data-active onClick={() => (window as unknown as { __qcCrop?: { apply: () => void } }).__qcCrop?.apply()} data-crop="apply">
                切り抜きを適用
              </button>
              <button className="chip" onClick={() => editor.setCropping(null)} data-crop="cancel">
                やめる
              </button>
            </>
          ) : (
            <>
              <button className="chip" onClick={() => editor.setCropping(sel[0]!.id)} data-crop="start">
                トリミング
              </button>
              {(sel[0] as ImageShape).crop && (
                <button
                  className="chip"
                  onClick={() => {
                    const img = sel[0] as ImageShape
                    loadImageSize(img.src).then((n) => editor.uncropImage(img.id, n)).catch(() => undefined)
                  }}
                  data-crop="reset"
                >
                  解除
                </button>
              )}
            </>
          )}
        </div>
      )}
      {sel.length >= 2 && (
        <div className="style-panel__row" data-testid="align-row">
          {(
            [
              ['left', '⇤', '左揃え'],
              ['centerX', '⫿', '左右中央'],
              ['right', '⇥', '右揃え'],
              ['top', '⤒', '上揃え'],
              ['centerY', '⫾', '上下中央'],
              ['bottom', '⤓', '下揃え']
            ] as const
          ).map(([how, icon, title]) => (
            <button key={how} className="chip" onClick={() => editor.align(sel.map((s) => s.id), how)} title={title} data-align-how={how}>
              {icon}
            </button>
          ))}
          {sel.length >= 3 && (
            <>
              <button className="chip" onClick={() => editor.distribute(sel.map((s) => s.id), 'x')} title="左右に等間隔" data-distribute="x">
                ⇹
              </button>
              <button className="chip" onClick={() => editor.distribute(sel.map((s) => s.id), 'y')} title="上下に等間隔" data-distribute="y">
                ⇳
              </button>
            </>
          )}
        </div>
      )}
      {sel.length > 0 && (
        <div className="style-panel__row">
          <button className="chip" onClick={() => editor.bringToFront(sel.map((s) => s.id))} title="最前面へ (Ctrl+Shift+])" data-z="front">
            ⬆⬆
          </button>
          <button className="chip" onClick={() => editor.bringForward(sel.map((s) => s.id))} title="前へ (Ctrl+])" data-z="forward">
            ⬆
          </button>
          <button className="chip" onClick={() => editor.sendBackward(sel.map((s) => s.id))} title="後ろへ (Ctrl+[)" data-z="backward">
            ⬇
          </button>
          <button className="chip" onClick={() => editor.sendToBack(sel.map((s) => s.id))} title="最背面へ (Ctrl+Shift+[)" data-z="back">
            ⬇⬇
          </button>
        </div>
      )}
      {sel.length > 0 && (
        <div className="style-panel__row">
          {sel.length >= 2 && !anyGrouped && (
            <button className="chip" onClick={() => editor.groupSelection()} title="グループ化 (Ctrl+G)" data-testid="group">
              グループ
            </button>
          )}
          {anyGrouped && (
            <button className="chip" onClick={() => editor.ungroupSelection()} title="グループ解除 (Ctrl+Shift+G)" data-testid="ungroup">
              解除
            </button>
          )}
          <button className="chip" data-active={anyLocked} onClick={() => editor.setLocked(sel.map((s) => s.id), !anyLocked)} title="ロック (Ctrl+L)" data-testid="lock">
            {anyLocked ? '🔓 解除' : '🔒 ロック'}
          </button>
        </div>
      )}
    </div>
  )
}
