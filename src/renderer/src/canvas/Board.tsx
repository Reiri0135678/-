import type { JSX } from 'react'
import { Tldraw, createShapeId, type Editor, type TLComponents, type TLUiOverrides } from 'tldraw'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { QcToolbar } from './QcToolbar'
import { RequestCardShapeUtil } from './RequestCardShape'
import { RequestCardTool } from './RequestCardTool'

/**
 * キャンバス層。tldraw への依存はこのディレクトリに閉じ込める。
 * 外側(リスト・kintone連携)は Board の props / イベント経由でのみやり取りする方針。
 */

// アイコン・フォントをバンドルに同梱(オフライン動作・CSP 対応)
// file:// で動く Electron では formatAssetUrl が絶対URLを壊すため、URL をそのまま使う
const assetUrls = getAssetUrlsByImport((url) => url)

const shapeUtils = [RequestCardShapeUtil]
const tools = [RequestCardTool]

// 既定 UI のうち不要なものを消し、ツールバーを自前に差し替える
const components: TLComponents = {
  Toolbar: QcToolbar,
  MainMenu: null,
  PageMenu: null,
  HelpMenu: null,
  DebugPanel: null,
  DebugMenu: null,
  SharePanel: null,
  MenuPanel: null,
  ZoomMenu: null
}

// 独自ツールを tldraw のツール一覧に登録(ショートカット含む)
const overrides: TLUiOverrides = {
  tools(editor, tools) {
    tools['request-card'] = {
      id: 'request-card',
      icon: 'tool-note',
      label: '検査依頼カード',
      kbd: 'r',
      onSelect: () => editor.setCurrentTool('request-card')
    }
    return tools
  }
}

/** デモ用: 空のボードにサンプルの依頼カードと注釈を置く */
function seedDemo(editor: Editor): void {
  if (editor.getCurrentPageShapeIds().size > 0) return
  editor.createShapes([
    {
      id: createShapeId(),
      type: 'request-card',
      x: 120,
      y: 80,
      props: { partNo: 'A-1234', lot: 'L240905', qty: '50', status: '受付' }
    },
    {
      id: createShapeId(),
      type: 'request-card',
      x: 400,
      y: 80,
      props: { dept: '製造2課', partNo: 'B-0077', lot: 'L240903', qty: '12', status: '検査中' }
    },
    {
      id: createShapeId(),
      type: 'note',
      x: 120,
      y: 260,
      props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '外径の寸法を重点確認' }] }] } }
    }
  ])
  editor.zoomToFit({ animation: { duration: 0 } })
}

export interface BoardProps {
  demo?: boolean
}

export function Board({ demo = false }: BoardProps): JSX.Element {
  return (
    <Tldraw
      assetUrls={assetUrls}
      onMount={(editor) => {
        if (demo) seedDemo(editor)
      }}
      persistenceKey="qc-board-local"
      shapeUtils={shapeUtils}
      tools={tools}
      components={components}
      overrides={overrides}
      options={{ maxPages: 1 }}
    />
  )
}
