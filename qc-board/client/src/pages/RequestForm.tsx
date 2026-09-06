import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { listRooms, me, submitRequest, uploadImage, type Me, type RequestInput } from '../api'
import { loadImageSize } from '../canvas/useImage'
import { expandFiles } from '../canvas/pdf'

type Attached = { id: string; name: string; w: number; h: number; src: string }

/**
 * 依頼フォーム(/form/:roomId)。依頼者はボードを開かずにここから依頼を出す。
 * スマホ・タブレットでも使えるよう 1 カラムの縦並び。送信するとボードにカードと図面が現れる。
 */
export function RequestForm({ roomId }: { roomId: string }): JSX.Element {
  const [user, setUser] = useState<Me | null | undefined>(undefined)
  const [boardName, setBoardName] = useState('')
  const [form, setForm] = useState<Omit<RequestInput, 'images'>>({
    title: '',
    dept: '',
    partNo: '',
    lot: '',
    qty: '',
    note: '',
    dueDate: '',
    priority: '通常'
  })
  const [images, setImages] = useState<Attached[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ no: string } | null>(null)

  useEffect(() => {
    me()
      .then((u) => {
        if (!u) navigate(`/?next=${encodeURIComponent(`/form/${roomId}`)}`)
        else setUser(u)
      })
      .catch(() => navigate('/'))
    listRooms()
      .then((rooms) => setBoardName(rooms.find((r) => r.id === roomId)?.name ?? roomId))
      .catch(() => undefined)
  }, [roomId])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const attach = async (files: FileList | null) => {
    if (!files) return
    setError('')
    let expanded: File[] = []
    try {
      expanded = await expandFiles(Array.from(files))
    } catch (e) {
      setError(`PDF の変換に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    for (const file of expanded) {
      try {
        const up = await uploadImage(file)
        let w = 400
        let h = 300
        try {
          const nat = await loadImageSize(up.src)
          w = nat.w
          h = nat.h
        } catch {
          /* サイズ不明なら既定 */
        }
        setImages((list) => [...list, { id: up.id, name: file.name, w, h, src: up.src }])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const submit = async () => {
    if (!form.partNo.trim() && !form.title.trim()) {
      setError('品番か件名のどちらかは入力してください')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await submitRequest(roomId, { ...form, images: images.map(({ id, name, w, h }) => ({ id, name, w, h })) })
      setDone({ no: r.no })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setForm({ title: '', dept: form.dept, partNo: '', lot: '', qty: '', note: '', dueDate: '', priority: '通常' })
    setImages([])
    setDone(null)
  }

  if (!user) return <p className="muted center">読み込み中…</p>

  if (done) {
    return (
      <div className="landing">
        <div className="landing__card form-done" data-testid="form-done">
          <h1>受け付けました</h1>
          <p className="form-done__no" data-testid="form-no">
            {done.no}
          </p>
          <p className="muted">受付番号です。問い合わせの際はこの番号をお伝えください。</p>
          <div className="stack">
            <button className="btn btn--primary btn--lg" onClick={reset} data-testid="form-again">
              続けて依頼する
            </button>
            <button className="btn btn--lg" onClick={() => navigate(`/b/${encodeURIComponent(roomId)}`)}>
              ボードを開く
            </button>
            <button className="link" onClick={() => navigate('/')}>
              ← ボード一覧
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="landing landing--top">
      <form
        className="landing__card form"
        data-testid="request-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="who">
          <span>
            <b>検査依頼</b> → {boardName}
          </span>
          <span className="muted">{user.name}</span>
        </div>
        {error && <p className="error">{error}</p>}

        <label className="field">
          <span>品番 *</span>
          <input value={form.partNo} onChange={(e) => set('partNo', e.target.value)} placeholder="例: A-1234" data-field="partNo" autoFocus />
        </label>
        <div className="form__row">
          <label className="field">
            <span>ロット</span>
            <input value={form.lot} onChange={(e) => set('lot', e.target.value)} data-field="lot" />
          </label>
          <label className="field">
            <span>数量</span>
            <input value={form.qty} onChange={(e) => set('qty', e.target.value)} inputMode="numeric" data-field="qty" />
          </label>
        </div>
        <label className="field">
          <span>依頼部門</span>
          <input value={form.dept} onChange={(e) => set('dept', e.target.value)} placeholder="例: 製造1課" data-field="dept" />
        </label>
        <label className="field">
          <span>件名</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例: 外径寸法の確認" data-field="title" />
        </label>
        <div className="form__row">
          <label className="field">
            <span>希望納期</span>
            <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} data-field="dueDate" />
          </label>
          <label className="field">
            <span>優先度</span>
            <select value={form.priority} onChange={(e) => set('priority', e.target.value as '通常' | '至急')} data-field="priority">
              <option>通常</option>
              <option>至急</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>検査項目・備考</span>
          <textarea rows={4} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="測ってほしい箇所、判定基準、気になる点など" data-field="note" />
        </label>
        <label className="field">
          <span>図面・写真(画像・PDF、複数可)</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => void attach(e.target.files)} data-testid="form-files" />
        </label>
        {images.length > 0 && (
          <ul className="gallery" data-testid="form-gallery">
            {images.map((im) => (
              <li key={im.id} className="gallery__item">
                <img src={im.src} alt="" />
                <div className="gallery__meta">
                  <span className="gallery__name">{im.name}</span>
                  <button type="button" className="link" onClick={() => setImages((l) => l.filter((x) => x.id !== im.id))}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn--primary btn--lg" type="submit" disabled={busy} data-testid="form-submit">
          {busy ? '送信中…' : '依頼を送る'}
        </button>
        <button type="button" className="link" onClick={() => navigate('/')}>
          ← ボード一覧
        </button>
      </form>
    </div>
  )
}
