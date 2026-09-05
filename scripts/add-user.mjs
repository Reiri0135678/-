// 使い方: node scripts/add-user.mjs <名前> <パスワード> [admin|member|viewer]
// config/users.json(環境変数 QC_USERS_FILE で変更可)にユーザーを追加・更新する。
// 副作用: ファイルを作成/上書きする。パスワードは scrypt でハッシュ化して保存し、平文は残さない。
import { randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [name, password, role = 'member'] = process.argv.slice(2)
if (!name || !password) {
  console.error('使い方: node scripts/add-user.mjs <名前> <パスワード> [admin|member|viewer]')
  process.exit(1)
}
if (!['admin', 'member', 'viewer'].includes(role)) {
  console.error('role は admin / member / viewer のいずれか')
  process.exit(1)
}
const file = process.env.QC_USERS_FILE ?? 'config/users.json'
const users = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
const salt = randomBytes(16).toString('hex')
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
const i = users.findIndex((u) => u.name === name)
if (i >= 0) users[i] = { name, role, hash }
else users.push({ name, role, hash })
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, JSON.stringify(users, null, 2) + '\n')
console.log(`${i >= 0 ? '更新' : '追加'}: ${name} (${role}) → ${file}`)
