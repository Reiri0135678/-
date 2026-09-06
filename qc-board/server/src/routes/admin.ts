import express, { Router } from 'express'
import type { Auth } from '../auth'
import type { Notifier } from '../notify'
import type { RoomManager } from '../rooms'
import { AUTO_ARCHIVE_DAYS } from '../config'

/** 通知・保守(管理者向け) */
export function adminRoutes(auth: Auth, rooms: RoomManager, notifier: Notifier, runBackup: () => Promise<string | null>): Router {
  const r = Router()
  r.get('/api/notify/status', auth.require('viewer'), (_req, res) => {
    res.json(notifier.status())
  })
  r.get('/api/notify/recent', auth.require('admin'), (_req, res) => {
    res.json(notifier.sent.slice(-50))
  })
  r.post('/api/admin/backup', auth.require('admin'), async (_req, res) => {
    try {
      const dest = await runBackup()
      if (!dest) {
        res.status(400).json({ error: 'QC_BACKUP_DIR が未設定です' })
        return
      }
      res.json({ dest })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })
  r.post('/api/admin/archive', auth.require('admin'), express.json(), async (req, res) => {
    const days = Number(req.body?.days ?? AUTO_ARCHIVE_DAYS)
    if (!(days >= 0)) {
      res.status(400).json({ error: 'days が不正です' })
      return
    }
    res.json({ archived: await rooms.autoArchiveAll(days) })
  })

  return r
}
