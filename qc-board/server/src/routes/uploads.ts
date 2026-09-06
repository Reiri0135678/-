import express, { Router } from 'express'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Auth } from '../auth'
import { SAFE_ID, UPLOAD_DIR } from '../config'

/** 画像などのアップロード(ログイン必須) */
export function uploadRoutes(auth: Auth): Router {
  const r = Router()
  r.put(
    '/api/uploads/:id',
    auth.require('member'),
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req, res) => {
      const id = String(req.params['id'])
      if (!SAFE_ID.test(id)) {
        res.status(400).json({ error: 'invalid id' })
        return
      }
      await writeFile(join(UPLOAD_DIR, id), req.body as Buffer)
      res.json({ ok: true })
    }
  )

  r.get('/api/uploads/:id', auth.require('viewer'), async (req, res) => {
    const id = String(req.params['id'])
    if (!SAFE_ID.test(id)) {
      res.status(400).end()
      return
    }
    const file = join(UPLOAD_DIR, id)
    if (!existsSync(file)) {
      res.status(404).end()
      return
    }
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.sendFile(file)
  })
  return r
}
