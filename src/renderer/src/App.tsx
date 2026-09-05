import type { JSX } from 'react'
import { Board } from './canvas/Board'

export default function App(): JSX.Element {
  const v = window.api?.versions
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">QC Board</span>
        <span className="app__meta">
          {v ? `Electron ${v.electron} / Node ${v.node}` : 'browser preview'}
        </span>
      </header>
      <aside className="app__sidebar">
        <h2>依頼リスト(予定)</h2>
        <p>ここに検査依頼のスプレッドシート式リストと画像一覧を配置予定。</p>
        <p>キャンバス上の「依頼カード」と双方向に連動させる想定。</p>
      </aside>
      <main className="app__board">
        <Board demo={window.api?.demo ?? false} />
      </main>
    </div>
  )
}
