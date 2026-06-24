import { NextResponse } from 'next/server'

import { getSessionStudent } from '@/lib/server/auth'

export const runtime = 'nodejs'

export async function GET() {
  const student = await getSessionStudent()
  if (!student) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({ authenticated: true, student })
}
