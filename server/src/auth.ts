import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { NextFunction, Request, Response } from 'express'

/**
 * 認証。
 * - config/users.json が無い(または空)なら「名前自己申告」のオープンモード
 * - あれば名前+パスワード。役割は admin / member / viewer(viewer は閲覧のみ)
 * - セッションは HMAC 署名付き Cookie。秘密鍵は data/secret に自動生成
 * 社内アカウント(Microsoft 365 等)連携は、この層を OIDC に差し替えて対応する想定
 */
export type Role = 'admin' | 'member' | 'viewer'
export interface SessionUser {
  name: string
  role: Role
}
interface StoredUser {
  name: string
  role: Role
  hash: string
}

const COOKIE = 'qc_session'
const SESSION_DAYS = 30
const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2 }

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hex] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hex) return false
  const a = scryptSync(password, salt, 64)
  const b = Buffer.from(hex, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export class Auth {
  private secret = ''
  constructor(
    private readonly usersFile: string,
    private readonly secretFile: string
  ) {}

  async init(): Promise<void> {
    if (existsSync(this.secretFile)) {
      this.secret = (await readFile(this.secretFile, 'utf8')).trim()
    } else {
      this.secret = randomBytes(32).toString('hex')
      await mkdir(dirname(this.secretFile), { recursive: true })
      await writeFile(this.secretFile, this.secret, { mode: 0o600 })
    }
  }

  private async loadUsers(): Promise<StoredUser[]> {
    if (!existsSync(this.usersFile)) return []
    try {
      const list = JSON.parse(await readFile(this.usersFile, 'utf8'))
      return Array.isArray(list) ? list : []
    } catch (err) {
      console.error('[auth] users.json の読込に失敗', err)
      return []
    }
  }

  async mode(): Promise<'open' | 'password'> {
    return (await this.loadUsers()).length > 0 ? 'password' : 'open'
  }

  async login(name: string, password: string | undefined): Promise<SessionUser | null> {
    name = name.trim()
    if (!name || name.length > 40) return null
    const users = await this.loadUsers()
    if (users.length === 0) return { name, role: 'member' }
    const u = users.find((x) => x.name === name)
    if (!u || !password || !verifyPassword(password, u.hash)) return null
    return { name: u.name, role: u.role ?? 'member' }
  }

  // ---- セッション Cookie --------------------------------------------
  issueCookie(user: SessionUser): string {
    const exp = Date.now() + SESSION_DAYS * 86400_000
    const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString('base64url')
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url')
    const maxAge = SESSION_DAYS * 86400
    return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  }

  clearCookie(): string {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  }

  userFromRequest(req: IncomingMessage): SessionUser | null {
    const raw = req.headers.cookie
    if (!raw) return null
    const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
    if (!m) return null
    const [payload, sig] = m[1]!.split('.')
    if (!payload || !sig) return null
    const expect = createHmac('sha256', this.secret).update(payload).digest('base64url')
    if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
      if (!(data.role in ROLE_RANK)) return null
      return { name: String(data.name), role: data.role }
    } catch {
      return null
    }
  }

  /** express ミドルウェア: 指定ロール以上を要求 */
  require(minRole: Role = 'viewer') {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = this.userFromRequest(req)
      if (!user) {
        res.status(401).json({ error: 'ログインが必要です' })
        return
      }
      if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
        res.status(403).json({ error: 'この操作の権限がありません' })
        return
      }
      req.user = user
      next()
    }
  }
}

export function canWrite(user: SessionUser): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK.member
}
