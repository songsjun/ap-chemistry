import { NextResponse, type NextRequest } from 'next/server'

import { authenticateAccessCode, setSession } from '@/lib/server/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { accessCode?: unknown } | null
  const accessCode = typeof body?.accessCode === 'string' ? body.accessCode : ''
  if (!accessCode.trim()) {
    return NextResponse.json({ error: 'access_code_required' }, { status: 400 })
  }

  const student = await authenticateAccessCode(accessCode)
  if (!student) {
    return NextResponse.json({ error: 'invalid_access_code' }, { status: 401 })
  }

  const response = NextResponse.json({ student })
  setSession(response, student)
  return response
}
