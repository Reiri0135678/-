// 使い方: node scripts/backup.mjs [保存先=backups] [世代数=14]
// data/(環境変数 QC_DATA_DIR)を backups/<日時>/ にコピーし、古い世代を削除する。サーバー稼働中でも実行可。
import { backup } from '../server/src/maintenance.ts'
import { resolve } from 'node:path'

const dataDir = resolve(process.env.QC_DATA_DIR ?? 'data')
const dest = resolve(process.argv[2] ?? process.env.QC_BACKUP_DIR ?? 'backups')
const keep = Number(process.argv[3] ?? process.env.QC_BACKUP_KEEP ?? 14)
const out = await backup(dataDir, dest, keep)
console.log(`バックアップ: ${out}(${keep} 世代保持)`)
