import type { JSX } from 'react'
import { useEffect } from 'react'
import {
  Tldraw,
  createShapeId,
  defaultBindingUtils,
  defaultShapeUtils,
  useValue,
  type Editor,
  type TLComponents,
  type TLUiOverrides
} from 'tldraw'
import { useSync } from '@tldraw/sync'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { syncUri } from '../api'
import { qcAssetStore } from './assets'
import { QcToolbar } from './QcToolbar'
import { RequestCardShapeUtil } from './RequestCardShape'
import { RequestCardTool } from './RequestCardTool'

/**
 * キャンバス層。tldraw / @tldraw/sync への依存はこのディレクトリに閉じ込める。
 * 外側(リスト・kintone連携)は Board の props / コールバック経由でのみやり取りする方針。
 */

const assetUrls = getAssetUrlsByImport()
// Tldraw コンポーネントには独自図形だけ渡す(既定は内部で追加される)が、
// useSync のスキーマ構築には既定図形も含めて渡す必要がある
const shapeUtils = [RequestCardShapeUtil]
const syncShapeUtils = [...defaultShapeUtils, ...shapeUtils]
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
      props: {
        richText: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '外径の寸法を重点確認' }] }]
        }
      }
    }
  ])
  editor.zoomToFit({ animation: { duration: 0 } })
}

export type BoardStatus = 'connecting' | 'online' | 'offline' | 'error'

export interface BoardProps {
  roomId: string
  userName: string
  demo?: boolean
  onStatus?: (s: BoardStatus) => void
  onPeers?: (n: number) => void
  /** マウント時に Editor を外側へ渡す(サイドバー等が購読するため) */
  onEditor?: (editor: Editor | null) => void
}

export function Board({ roomId, userName, demo = false, onStatus, onPeers, onEditor }: BoardProps): JSX.Element {
  const store = useSync({
    uri: syncUri(roomId),
    assets: qcAssetStore,
    shapeUtils: syncShapeUtils,
    bindingUtils: defaultBindingUtils
  })

  useEffect(() => {
    if (store.status === 'loading') onStatus?.('connecting')
    else if (store.status === 'error') onStatus?.('error')
    else onStatus?.(store.connectionStatus === 'online' ? 'online' : 'offline')
  }, [store, onStatus])

  if (store.status === 'error') {
    return (
      <div className="board-error">
        <p>ボードに接続できませんでした。</p>
        <pre>{String(store.error)}</pre>
      </div>
    )
  }

  return (
    <Tldraw
      store={store}
      assetUrls={assetUrls}
      shapeUtils={shapeUtils}
      tools={tools}
      components={components}
      overrides={overrides}
      options={{ maxPages: 1 }}
      onMount={(editor) => {
        editor.user.updateUserPreferences({ name: userName })
        // E2E テストと開発時の検証用
        ;(window as unknown as { __qcEditor?: Editor }).__qcEditor = editor
        if (demo) seedDemo(editor)
        onEditor?.(editor)
        return () => onEditor?.(null)
      }}
    >
      {onPeers && <PeerCounter onPeers={onPeers} />}
    </Tldraw>
  )
}

/** 同じボードにいる他の人数を親へ通知する */
function PeerCounter({ onPeers }: { onPeers: (n: number) => void }): null {
  const editor = useEditorSafe()
  const n = useValue('peers', () => editor?.getCollaborators().length ?? 0, [editor])
  useEffect(() => onPeers(n), [n, onPeers])
  return null
}

import { useEditor } from 'tldraw'
function useEditorSafe(): Editor | null {
  try {
    return useEditor()
  } catch {
    return null
  }
}
