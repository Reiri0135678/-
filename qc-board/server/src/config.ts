import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** 環境変数から読む設定(既定値つき) */
export const PORT = Number(process.env['PORT'] ?? 3000)
export const DATA_DIR = resolve(process.env['QC_DATA_DIR'] ?? 'data')
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')
export const CLIENT_DIR = resolve('dist/client')
export const USERS_FILE = resolve(process.env['QC_USERS_FILE'] ?? 'config/users.json')
export const KINTONE_CONFIG = resolve(process.env['QC_KINTONE_CONFIG'] ?? 'config/kintone.json')
export const NOTIFY_CONFIG = resolve(process.env['QC_NOTIFY_CONFIG'] ?? 'config/notify.json')
export const BACKUP_DIR = process.env['QC_BACKUP_DIR'] ? resolve(process.env['QC_BACKUP_DIR']) : ''
export const BACKUP_KEEP = Number(process.env['QC_BACKUP_KEEP'] ?? 14)
export const BACKUP_INTERVAL_H = Number(process.env['QC_BACKUP_INTERVAL_HOURS'] ?? 24)
export const AUTO_ARCHIVE_DAYS = Number(process.env['QC_AUTO_ARCHIVE_DAYS'] ?? 0)
/** HTTPS の前段(Caddy / ALB など)の後ろで動かすとき 1。Cookie に Secure を付け、X-Forwarded-* を信用する */
export const BEHIND_HTTPS_PROXY = process.env['QC_BEHIND_HTTPS_PROXY'] === '1'
export const VERSION = (() => {
  try {
    return String((JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string }).version ?? '')
  } catch {
    return ''
  }
})()

/** アップロード ID・添付 ID に許す文字 */
export const SAFE_ID = /^[A-Za-z0-9_.-]{1,120}$/
