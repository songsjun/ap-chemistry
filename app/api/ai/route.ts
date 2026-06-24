import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

const DEFAULT_PROXY_URL = 'http://127.0.0.1:4101/api/ai'
const DEFAULT_TIMEOUT_MS = 185_000

function getProxyUrl(): string {
  const configured = process.env.AP_AI_PROXY_URL?.trim()
  if (!configured) return DEFAULT_PROXY_URL

  const url = new URL(configured)
  if (url.pathname === '' || url.pathname === '/') url.pathname = '/api/ai'
  return url.toString()
}

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AP_AI_PROXY_TIMEOUT_MS ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

export async function POST(request: NextRequest) {
  let body: string
  try {
    body = await request.text()
  } catch {
    return NextResponse.json({ ok: false, error_type: 'bad_request' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs())

  try {
    const upstream = await fetch(getProxyUrl(), {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      {
        ok: false,
        error_type: aborted ? 'timeout' : 'proxy_unavailable',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: aborted ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}

