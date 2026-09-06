import express, { Router } from 'express'
import type { Auth } from '../auth'
import type { Kintone } from '../kintone'
import type { RoomManager } from '../rooms'
import { SAFE_ID } from '../config'

/** ボード一覧・依頼・履歴・kintone 送信 */
export function roomRoutes(auth: Auth, rooms: RoomManager, kintone: Kintone): Router {
  const r = Router()
  r.get('/api/rooms', auth.require('viewer'), async (_req, res) => {
    res.json(await rooms.list())
  })

  r.post('/api/rooms', auth.require('member'), express.json(), async (req, res) => {
    const name = String(req.body?.name ?? '').trim()
    if (!name || name.length > 60) {
      res.status(400).json({ error: 'name は 1〜60 文字' })
      return
    }
    res.status(201).json(await rooms.create(name))
  })

  r.get('/api/rooms/:id/requests', auth.require('viewer'), async (req, res) => {
    const list = await rooms.listRequests(String(req.params['id']))
    if (!list) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(list)
  })

  // 依頼フォームからの投入(カード作成はサーバー側。添付画像は先に /api/uploads へ PUT しておく)
  r.post('/api/rooms/:id/requests', auth.require('member'), express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body ?? {}
    const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max)
    const input = {
      title: str(b.title) || '検査依頼',
      dept: str(b.dept),
      partNo: str(b.partNo),
      lot: str(b.lot),
      qty: str(b.qty, 20),
      note: str(b.note, 2000),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate ?? '')) ? String(b.dueDate) : '',
      priority: b.priority === '至急' ? ('至急' as const) : ('通常' as const),
      requester: str(b.requester, 40) || req.user!.name
    }
    const images = (Array.isArray(b.images) ? b.images : [])
      .filter((i: { id?: string }) => typeof i?.id === 'string' && SAFE_ID.test(i.id))
      .slice(0, 20)
      .map((i: { id: string; name?: string; w?: number; h?: number }) => ({
        src: `/api/uploads/${i.id}`,
        name: str(i.name, 120),
        w: Number(i.w) || 400,
        h: Number(i.h) || 300
      }))
    const card = await rooms.createRequest(String(req.params['id']), req.user!.name, input, images)
    if (!card) {
      res.status(404).json({ error: 'not found' })
      return
    }
    console.log(`[request] ${card.no} on ${req.params['id']} by ${req.user!.name}`)
    res.status(201).json({ id: card.id, no: card.no })
  })

  r.get('/api/rooms/:id/history', auth.require('viewer'), async (req, res) => {
    const shapeId = typeof req.query['shapeId'] === 'string' ? req.query['shapeId'] : undefined
    const list = await rooms.history(String(req.params['id']), shapeId)
    if (!list) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(list)
  })


  r.get('/api/kintone/status', auth.require('viewer'), (_req, res) => {
    res.json(kintone.status())
  })

  r.post('/api/rooms/:id/kintone/sync', auth.require('member'), async (req, res) => {
    const id = String(req.params['id'])
    const list = await rooms.listRequests(id)
    if (!list) {
      res.status(404).json({ error: 'not found' })
      return
    }
    try {
      const result = await kintone.sync(list)
      await rooms.setKintoneIds(id, result.ids, req.user!.name)
      console.log(`[kintone] ${id}: created=${result.created} updated=${result.updated} by ${req.user?.name}`)
      res.json({ created: result.created, updated: result.updated, total: list.length })
    } catch (err) {
      console.error('[kintone] sync failed', err)
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // ---- 画像などのアップロード -------------------------------------------
  return r
}
