import express, { Router } from 'express'
import type { Auth } from '../auth'
import type { RoomManager } from '../rooms'

/** 版(スナップショット)の一覧・保存・復元・削除 */
export function versionRoutes(auth: Auth, rooms: RoomManager): Router {
  const r = Router()
  r.get('/api/rooms/:id/versions', auth.require('viewer'), async (req, res) => {
    const room = await rooms.get(String(req.params['id']))
    if (!room) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(await room.listVersions())
  })
  r.post('/api/rooms/:id/versions', auth.require('member'), express.json(), async (req, res) => {
    const room = await rooms.get(String(req.params['id']))
    if (!room) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const info = await room.saveVersion(String(req.body?.name ?? '').slice(0, 60), req.user!.name)
    console.log(`[version] saved ${info.id} on ${req.params['id']} by ${req.user!.name}`)
    res.status(201).json(info)
  })
  r.post('/api/rooms/:id/versions/:vid/restore', auth.require('member'), async (req, res) => {
    const room = await rooms.get(String(req.params['id']))
    if (!room) {
      res.status(404).json({ error: 'not found' })
      return
    }
    // 復元前の状態も自動で残す(取り消し用)
    await room.saveVersion('復元前の自動保存', req.user!.name)
    const ok = await room.restoreVersion(String(req.params['vid']), req.user!.name)
    if (!ok) {
      res.status(404).json({ error: 'version not found' })
      return
    }
    console.log(`[version] restored ${req.params['vid']} on ${req.params['id']} by ${req.user!.name}`)
    res.json({ ok: true })
  })
  r.delete('/api/rooms/:id/versions/:vid', auth.require('admin'), async (req, res) => {
    const room = await rooms.get(String(req.params['id']))
    if (!room) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json({ ok: await room.deleteVersion(String(req.params['vid'])) })
  })

  return r
}
