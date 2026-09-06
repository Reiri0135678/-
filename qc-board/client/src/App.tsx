import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Landing } from './pages/Landing'
import { BoardPage } from './pages/BoardPage'
import { Embed } from './pages/Embed'
import { RequestForm } from './pages/RequestForm'

/** 依存を増やさないための最小ルーター: `/` と `/b/:roomId` のみ */
function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

export function navigate(to: string): void {
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function App(): JSX.Element {
  const path = usePath()
  if (path === '/embed') return <Embed />
  const f = path.match(/^\/form\/([^/]+)$/)
  if (f) return <RequestForm roomId={decodeURIComponent(f[1]!)} />
  const m = path.match(/^\/b\/([^/]+)$/)
  if (m) return <BoardPage roomId={decodeURIComponent(m[1]!)} />
  return <Landing />
}
