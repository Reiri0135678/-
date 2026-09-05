import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { listVersions, restoreVersion, saveVersion, type VersionInfo } from '../api'

/** 版の一覧・保存・復元(ヘッダーのボタンから開く) */
export function VersionsMenu({ roomId, readonly }: { roomId: string; readonly: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<VersionInfo[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reload = () => listVersions(roomId).then(setList).catch(() => setList([]))
  useEffect(() => {
    if (open) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId])
  const save = async () => {
    setBusy(true)
    try {
      await saveVersion(roomId, name.trim())
      setName('')
      setMsg('保存しました')
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const restore = async (v: VersionInfo) => {
    if (!window.confirm(`「${v.name}」の状態に戻します。今の状態は「復元前の自動保存」として残ります。よろしいですか?`)) return
    setBusy(true)
    try {
      await restoreVersion(roomId, v.id)
      setMsg('復元しました')
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const fmt = (ts: number) => new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <span className="peers">
      <button className="link" onClick={() => setOpen((v) => !v)} data-testid="versions-btn">
        版
      </button>
      {open && (
        <div className="peers__pop versions" data-testid="versions-pop">
          {!readonly && (
            <div className="versions__save">
              <input value={name} placeholder="版の名前(例: 週次レビュー前)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} data-testid="version-name" />
              <button className="btn btn--primary" onClick={() => void save()} disabled={busy} data-testid="version-save">
                今の状態を保存
              </button>
            </div>
          )}
          {msg && <span className="muted">{msg}</span>}
          {list === null && <span className="muted">読み込み中…</span>}
          {list?.length === 0 && <span className="muted">保存した版はまだありません</span>}
          {list?.map((v) => (
            <div key={v.id} className="peers__row" data-testid="version-row">
              <span>
                <b>{v.name}</b>
                <br />
                <small className="muted">
                  {fmt(v.ts)} · {v.by} · {v.shapes} 図形
                </small>
              </span>
              {!readonly && (
                <button className="chip" onClick={() => void restore(v)} disabled={busy} data-testid="version-restore">
                  復元
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
