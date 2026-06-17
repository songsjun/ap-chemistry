import { NextResponse, type NextRequest } from 'next/server'

import { AuthError, requireStudent, unauthorized } from '@/lib/server/auth'
import { listQuizResults, saveQuizResultForUser } from '@/lib/server/progress'

export const runtime = 'nodejs'

function intParam(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : undefined
}

export async function GET(request: NextRequest) {
  try {
    const student = await requireStudent()
    const week = intParam(request.nextUrl.searchParams.get('week'))
    const day = intParam(request.nextUrl.searchParams.get('day'))
    return NextResponse.json({ quizResults: await listQuizResults(student.id, week, day) })
  } catch (error) {
    if (error instanceof AuthError) return unauthorized()
    throw error
  }
}

export async function PUT(request: NextRequest) {
  try {
    const student = await requireStudent()
    const body = await request.json()
    return NextResponse.json({ quizResult: await saveQuizResultForUser(student.id, body) })
  } catch (error) {
    if (error instanceof AuthError) return unauthorized()
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
}
