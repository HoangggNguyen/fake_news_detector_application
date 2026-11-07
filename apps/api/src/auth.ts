import { createHash, randomBytes, randomUUID, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from './db.js'

const scrypt = promisify(callbackScrypt)
const cookieName = 'newsroom_auth'
const lifetimeMs = 7 * 24 * 60 * 60 * 1000
const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
})

export type AuthenticatedRequest = Request & { userId: string; username: string }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, encoded] = hash.split(':')
  if (!salt || !encoded || !/^[0-9a-f]{128}$/i.test(encoded)) return false
  const expected = Buffer.from(encoded, 'hex')
  const actual = await scrypt(password, salt, expected.length) as Buffer
  return timingSafeEqual(actual, expected)
}

function readToken(request: Request): string | null {
  const cookie = request.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

async function createLogin(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString('hex')
  await pool.execute(
    'INSERT INTO login_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash(token), userId, new Date(Date.now() + lifetimeMs)],
  )
  response.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetimeMs })
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = readToken(request)
  if (!token) {
    response.status(401).json({ error: 'Vui lòng đăng nhập.' })
    return
  }
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT users.id, users.username FROM login_sessions JOIN users ON users.id = login_sessions.user_id WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()',
      [tokenHash(token)],
    )
    if (!rows[0]) {
      response.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' })
      return
    }
    const authenticated = request as AuthenticatedRequest
    authenticated.userId = String(rows[0].id)
    authenticated.username = String(rows[0].username)
    next()
  } catch (error) {
    console.error('Authentication lookup failed:', error instanceof Error ? error.message : error)
    response.status(503).json({ error: 'Không thể xác thực tài khoản.' })
  }
}

export const authRouter = Router()

authRouter.post('/register', async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Tên đăng nhập cần 3–80 ký tự hợp lệ; mật khẩu cần 8–128 ký tự.' })
    return
  }
  const { username, password } = parsed.data
  try {
    const id = randomUUID()
    const hash = await hashPassword(password)
    await pool.execute(
      'INSERT INTO users (id, username, password_hash, real_pass) VALUES (?, ?, ?, ?)',
      [id, username, hash, password],
    )
    await createLogin(id, response)
    response.status(201).json({ user: { id, username } })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ error: 'Tên đăng nhập đã được sử dụng.' })
      return
    }
    console.error('Registration failed:', error instanceof Error ? error.message : error)
    response.status(503).json({ error: 'Không thể tạo tài khoản.' })
  }
})

authRouter.post('/login', async (request, response) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Thông tin đăng nhập không hợp lệ.' })
    return
  }
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, username, password_hash FROM users WHERE username = ?',
      [parsed.data.username],
    )
    if (!rows[0] || !(await verifyPassword(parsed.data.password, String(rows[0].password_hash)))) {
      response.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' })
      return
    }
    await createLogin(String(rows[0].id), response)
    response.json({ user: { id: rows[0].id, username: rows[0].username } })
  } catch (error) {
    console.error('Login failed:', error instanceof Error ? error.message : error)
    response.status(503).json({ error: 'Không thể đăng nhập.' })
  }
})

authRouter.get('/me', requireAuth, (request, response) => {
  const authenticated = request as AuthenticatedRequest
  response.json({ user: { id: authenticated.userId, username: authenticated.username } })
})

authRouter.post('/logout', requireAuth, async (request, response) => {
  try {
    const token = readToken(request)
    if (token) await pool.execute('DELETE FROM login_sessions WHERE token_hash = ?', [tokenHash(token)])
    response.clearCookie(cookieName, cookieOptions)
    response.json({ status: 'logged_out' })
  } catch (error) {
    console.error('Logout failed:', error instanceof Error ? error.message : error)
    response.status(503).json({ error: 'Không thể đăng xuất.' })
  }
})
