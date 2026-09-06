import express, { Router } from 'express'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UserTemplate } from '../../../shared/shapes'
import type { Auth } from '../auth'
import { DATA_DIR } from '../config'

const TEMPLATES_FILE = join(DATA_DIR, 'templates.json')
async function readTemplates(): Promise<UserTemplate[]> {
  try {
    return JSON.parse(await readFile(TEMPLATES_FILE, 'utf8')) as UserTemplate[]
  } catch {
    return []
  }
}

/** 自作の雛形(全ボード共通、data/templates.json) */
export function templateRoutes(auth: Auth): Router {
  const r = Router()
  r.get('/api/templates', auth.require('viewer'), async (_req, res) => {
    res.json(await readTemplates())
  })
  r.post('/api/templates', auth.require('member'), express.json({ limit: '2mb' }), async (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 60)
    const shapes = Array.isArray(req.body?.shapes) ? (req.body.shapes as UserTemplate['shapes']) : []
    if (!name || shapes.length === 0 || shapes.length > 500) {
      res.status(400).json({ error: '名前と図形(1〜500)が必要です' })
      return
    }
    const list = await readTemplates()
    const t: UserTemplate = { id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, by: req.user!.name, ts: Date.now(), shapes }
    list.push(t)
    await writeFile(TEMPLATES_FILE, JSON.stringify(list))
    res.status(201).json({ id: t.id, name: t.name, by: t.by, ts: t.ts, count: shapes.length })
  })
  r.delete('/api/templates/:id', auth.require('member'), async (req, res) => {
    const list = await readTemplates()
    const t = list.find((x) => x.id === req.params['id'])
    if (!t) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (t.by !== req.user!.name && req.user!.role !== 'admin') {
      res.status(403).json({ error: '作成者か管理者だけが削除できます' })
      return
    }
    await writeFile(TEMPLATES_FILE, JSON.stringify(list.filter((x) => x.id !== t.id)))
    res.json({ ok: true })
  })

  return r
}
