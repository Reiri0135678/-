import { cp, mkdir, readdir, rm, stat, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 保守: バックアップ(data/ の丸ごとコピー、世代管理)と履歴ログのローテーション。
 * 副作用: backups/<日時>/ を作成し、古い世代を削除する。
 */
export async function backup(dataDir: string, backupDir: string, keep: number): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dest = join(backupDir, stamp)
  await mkdir(backupDir, { recursive: true })
  const resolvedBackup = resolve(backupDir)
  await cp(dataDir, dest, {
    recursive: true,
    // 署名鍵は除外。バックアップ先が data/ の中にある場合は自分自身を除外
    filter: (src) => !src.endsWith('secret') && !resolve(src).startsWith(resolvedBackup)
  })
  // 古い世代を削除
  const dirs = (await readdir(backupDir)).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort()
  for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) {
    await rm(join(backupDir, d), { recursive: true, force: true })
  }
  return dest
}

/** ログが上限を超えたら .1 .2 … に繰り下げる。history() は繰り下げ後も読む */
export async function rotateLog(file: string, maxBytes: number, generations: number): Promise<boolean> {
  if (!existsSync(file)) return false
  const { size } = await stat(file)
  if (size < maxBytes) return false
  for (let g = generations - 1; g >= 1; g--) {
    const from = rotatedName(file, g)
    const to = rotatedName(file, g + 1)
    if (existsSync(from)) {
      if (g + 1 > generations) await rm(from, { force: true })
      else await rename(from, to)
    }
  }
  await rename(file, rotatedName(file, 1))
  return true
}

export function rotatedName(file: string, g: number): string {
  return file.replace(/\.jsonl$/, `.${g}.jsonl`)
}
