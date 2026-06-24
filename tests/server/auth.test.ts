// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const cookiesMock = vi.hoisted(() => vi.fn())
const queryMock = vi.hoisted(() => vi.fn())
const ensureSchemaMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/server/db', () => ({
  query: queryMock,
}))

vi.mock('@/lib/server/schema', () => ({
  ensureSchema: ensureSchemaMock,
}))

import {
  AuthError,
  accessCodeLookup,
  authenticateAccessCode,
  createSessionCookie,
  hashAccessCode,
  requireStudent,
} from '@/lib/server/auth'

const originalNodeEnv = process.env.NODE_ENV
const originalVercelEnv = process.env.VERCEL_ENV
const originalSessionSecret = process.env.SESSION_SECRET
const originalLookupSecret = process.env.ACCESS_CODE_LOOKUP_SECRET

let cookieValue: string | undefined

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setEnv('NODE_ENV', 'test')
  delete process.env.VERCEL_ENV
  process.env.SESSION_SECRET = 'test-session-secret'
  process.env.ACCESS_CODE_LOOKUP_SECRET = 'test-lookup-secret'
  cookieValue = undefined
  ensureSchemaMock.mockResolvedValue(undefined)
  cookiesMock.mockImplementation(async () => ({
    get: (name: string) => name === 'ap_chem_session' && cookieValue ? { value: cookieValue } : undefined,
  }))
})

afterAll(() => {
  setEnv('NODE_ENV', originalNodeEnv)
  setEnv('VERCEL_ENV', originalVercelEnv)
  setEnv('SESSION_SECRET', originalSessionSecret)
  setEnv('ACCESS_CODE_LOOKUP_SECRET', originalLookupSecret)
})

describe('server auth', () => {
  it('authenticates an access code against the stored hash', async () => {
    const accessCode = 'CHEM-ABCDE-12345'
    queryMock.mockResolvedValueOnce([{
      id: 'student-1',
      display_name: 'Student One',
      access_code_hash: hashAccessCode(accessCode),
    }])

    await expect(authenticateAccessCode(accessCode)).resolves.toEqual({
      id: 'student-1',
      displayName: 'Student One',
    })
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('disabled_at IS NULL'), [
      accessCodeLookup(accessCode),
    ])
  })

  it('requires a signed cookie and reloads the active student from the database', async () => {
    cookieValue = createSessionCookie({ id: 'student-1', displayName: 'Cookie Name' })
    queryMock.mockResolvedValueOnce([{ id: 'student-1', display_name: 'DB Name' }])

    await expect(requireStudent()).resolves.toEqual({ id: 'student-1', displayName: 'DB Name' })
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('disabled_at IS NULL'), ['student-1'])
  })

  it('rejects a valid cookie when the student is missing or disabled', async () => {
    cookieValue = createSessionCookie({ id: 'student-1', displayName: null })
    queryMock.mockResolvedValueOnce([])

    await expect(requireStudent()).rejects.toBeInstanceOf(AuthError)
  })

  it('does not fall back to the public dev secret outside development', () => {
    setEnv('NODE_ENV', 'production')
    delete process.env.SESSION_SECRET

    expect(() => createSessionCookie({ id: 'student-1', displayName: null })).toThrow(/SESSION_SECRET/)

    process.env.SESSION_SECRET = 'dev-ap-chem-session-secret'
    expect(() => createSessionCookie({ id: 'student-1', displayName: null })).toThrow(/SESSION_SECRET/)
  })
})
