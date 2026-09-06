import express, { Router } from 'express'
import type { Auth } from '../auth'

/** 認証・埋め込み連携 */
export function authRoutes(auth: Auth): Router {
  const r = Router()
  r.get('/api/auth/mode', async (_req, res) => {
    res.json({ mode: await auth.mode() })
  })

  r.post('/api/auth/login', express.json(), async (req, res) => {
    const user = await auth.login(String(req.body?.name ?? ''), req.body?.password)
    if (!user) {
      res.status(401).json({ error: '名前またはパスワードが違います' })
      return
    }
    res.setHeader('Set-Cookie', auth.issueCookie(user))
    res.json(user)
  })

  r.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', auth.clearCookie())
    res.json({ ok: true })
  })

  r.get('/api/auth/me', auth.require('viewer'), (req, res) => {
    res.json(req.user)
  })

  // 外部アプリ(Mission Bridge 等)からの代理ログイン。
  // 1) ホスト側が共有鍵でトークンを取得 → 2) /embed?token=... を開く → 3) クライアントがトークンをセッションに交換
  r.post('/api/auth/embed', express.json(), (req, res) => {
    if (!auth.embedEnabled()) {
      res.status(404).json({ error: '埋め込み連携が無効です(QC_EMBED_KEY 未設定)' })
      return
    }
    const token = auth.issueEmbedToken(
      String(req.body?.key ?? ''),
      String(req.body?.name ?? ''),
      (req.body?.role ?? 'member') as 'admin' | 'member' | 'viewer'
    )
    if (!token) {
      res.status(401).json({ error: '鍵が違うか、name/role が不正です' })
      return
    }
    res.json({ token, expiresIn: 60 })
  })

  r.post('/api/auth/token', express.json(), (req, res) => {
    const user = auth.redeemEmbedToken(String(req.body?.token ?? ''))
    if (!user) {
      res.status(401).json({ error: 'トークンが無効または期限切れです' })
      return
    }
    res.setHeader('Set-Cookie', auth.issueCookie(user))
    res.json(user)
  })

  return r
}
