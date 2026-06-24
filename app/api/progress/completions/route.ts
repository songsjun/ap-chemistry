import { NextResponse, type NextRequest } from 'next/server'

import { AuthError, requireStudent, unauthorized } from '@/lib/server/auth'
import { listCompletions, saveCompletionForUser } from '@/lib/server/progress'

export const runtime = 'nodejs'

function parseCsv(value: string | null): string[] | undefined {
  if (!value) return undefined
  return value.split(',').map(part => decodeURIComponent(part).trim()).filter(Boolean)
}

export async function GET(request: NextRequest) {
  try {
    const student = await requireStudent()
    const resourceIds = parseCsv(request.nextUrl.searchParams.get('resourceIds'))
    return NextResponse.json({ completions: await listCompletions(student.id, resourceIds) })
  } catch (error) {
    if (error instanceof AuthError) return unauthorized()
    throw error
  }
}

export async function PUT(request: NextRequest) {
  try {
    const student = await requireStudent()
    const body = await request.json()
    return NextResponse.json({ completion: await saveCompletionForUser(student.id, body) })
  } catch (error) {
    if (error instanceof AuthError) return unauthorized()
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
}
