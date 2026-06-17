import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import './env'
import { query } from './db'
import { ensureSchema } from './schema'

export const SESSION_COOKIE_NAME = 'ap_chem_session'

const DEV_SESSION_SECRET = 'dev-ap-chem-session-secret'
const ACCESS_CODE_SCRYPT_N = 16_384
const ACCESS_CODE_SCRYPT_R = 8
const ACCESS_CODE_SCRYPT_P = 1
const ACCESS_CODE_KEYLEN = 32

interface StudentRow {
  id: string
  display_name: string | null
  access_code_hash: string
}

interface StudentIdentityRow {
  id: string
  display_name: string | null
}

export interface AuthenticatedStudent {
  id: string
  displayName: string | null
}

export class AuthError extends Error {
  status = 401
}

function allowsDevSecretFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production'
}

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim()
  if (configured && (allowsDevSecretFallback() || configured !== DEV_SESSION_SECRET)) {
    return configured
  }
  if (allowsDevSecretFallback()) return DEV_SESSION_SECRET
  throw new Error('SESSION_SECRET is required outside development')
}

function lookupSecret(): string {
  return process.env.ACCESS_CODE_LOOKUP_SECRET ?? secret()
}

function sessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14 * 24 * 60 * 60
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(`ap-chem-session:v1:${data}`).digest('base64url')
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}

export function normalizeAccessCode(code: string): string {
  return code.normalize('NFKC').trim()
}

export function accessCodeLookup(code: string): string {
  return createHmac('sha256', lookupSecret())
    .update(`ap-chem-access-code:v1:${normalizeAccessCode(code)}`)
    .digest('hex')
}

export function hashAccessCode(code: string): string {
  const salt = randomBytes(16).toString('base64url')
  const key = scryptSync(normalizeAccessCode(code), salt, ACCESS_CODE_KEYLEN, {
    N: ACCESS_CODE_SCRYPT_N,
    r: ACCESS_CODE_SCRYPT_R,
    p: ACCESS_CODE_SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt:v1:${ACCESS_CODE_SCRYPT_N}:${ACCESS_CODE_SCRYPT_R}:${ACCESS_CODE_SCRYPT_P}:${salt}:${key.toString('base64url')}`
}

export function verifyAccessCode(code: string, hash: string): boolean {
  const [algorithm, version, n, r, p, salt, expected] = hash.split(':')
  if (algorithm !== 'scrypt' || version !== 'v1' || !n || !r || !p || !salt || !expected) {
    return false
  }
  const key = scryptSync(normalizeAccessCode(code), salt, ACCESS_CODE_KEYLEN, {
    N: Number.parseInt(n, 10),
    r: Number.parseInt(r, 10),
    p: Number.parseInt(p, 10),
    maxmem: 64 * 1024 * 1024,
  }).toString('base64url')
  return safeEqual(key, expected)
}

export function generateAccessCode(prefix = 'CHEM'): string {
  const body = randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toUpperCase()
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5)}`
}

export async function authenticateAccessCode(code: string): Promise<AuthenticatedStudent | null> {
  await ensureSchema()
  const rows = await query<StudentRow>(
    `SELECT id, display_name, access_code_hash
     FROM students
     WHERE access_code_lookup = $1 AND disabled_at IS NULL
     LIMIT 1`,
    [accessCodeLookup(code)],
  )
  const row = rows[0]
  if (!row || !verifyAccessCode(code, row.access_code_hash)) return null
  return { id: row.id, displayName: row.display_name }
}

export async function getActiveStudentById(studentId: string): Promise<AuthenticatedStudent | null> {
  await ensureSchema()
  const rows = await query<StudentIdentityRow>(
    `SELECT id, display_name
     FROM students
     WHERE id = $1 AND disabled_at IS NULL
     LIMIT 1`,
    [studentId],
  )
  const row = rows[0]
  return row ? { id: row.id, displayName: row.display_name } : null
}

export function createSessionCookie(student: AuthenticatedStudent): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    sub: student.id,
    name: student.displayName,
    iat: now,
    exp: now + sessionTtlSeconds(),
  }
  const data = base64Url(JSON.stringify(payload))
  return `${data}.${sign(data)}`
}

export function verifySessionCookie(value: string | undefined): AuthenticatedStudent | null {
  if (!value) return null
  const [data, signature] = value.split('.')
  if (!data || !signature || !safeEqual(sign(data), signature)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      v?: number
      sub?: unknown
      name?: unknown
      exp?: unknown
    }
    if (payload.v !== 1 || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null
    return {
      id: payload.sub,
      displayName: typeof payload.name === 'string' ? payload.name : null,
    }
  } catch {
    return null
  }
}

export async function getSessionStudent(): Promise<AuthenticatedStudent | null> {
  const store = await cookies()
  const cookieStudent = verifySessionCookie(store.get(SESSION_COOKIE_NAME)?.value)
  if (!cookieStudent) return null
  return getActiveStudentById(cookieStudent.id)
}

export async function requireStudent(): Promise<AuthenticatedStudent> {
  const student = await getSessionStudent()
  if (!student) throw new AuthError('unauthorized')
  return student
}

export function setSession(response: NextResponse, student: AuthenticatedStudent): void {
  response.cookies.set(SESSION_COOKIE_NAME, createSessionCookie(student), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionTtlSeconds(),
  })
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
