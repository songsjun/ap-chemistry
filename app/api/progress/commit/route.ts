import { NextResponse, type NextRequest } from 'next/server'

import { AuthError, requireStudent, unauthorized } from '@/lib/server/auth'
import { commitProgressForUser } from '@/lib/server/progress'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const student = await requireStudent()
    const body = await request.json()
    return NextResponse.json(await commitProgressForUser(student.id, body))
  } catch (error) {
    if (error instanceof AuthError) return unauthorized()
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
}
