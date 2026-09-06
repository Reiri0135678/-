import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { redeemToken } from '../api'
import { notifyHost, setEmbed } from '../embed'
import { setUserName } from '../user'

/**
 * /embed?token=<ワンタイムトークン>&board=<ボードID>
 * ホストアプリが取得したトークンをセッションに交換し、指定ボード(無ければ一覧)へ進む。
 */
export function Embed(): JSX.Element {
  const [error, setError] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const token = q.get('token') ?? ''
    const board = q.get('board')
    setEmbed(true)
    redeemToken(token)
      .then((u) => {
        setUserName(u.name)
        notifyHost({ event: 'ready', user: u })
        navigate(board ? `/b/${encodeURIComponent(board)}` : '/')
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        notifyHost({ event: 'error', message })
      })
  }, [])

  return (
    <div className="center">
      {error ? <p className="error">埋め込みログインに失敗しました: {error}</p> : <p className="muted">接続中…</p>}
    </div>
  )
}
