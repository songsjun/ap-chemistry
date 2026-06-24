#!/usr/bin/env node

const gatewayBaseUrl = normalizeBaseUrl(process.env.AI_GATEWAY_URL || 'http://127.0.0.1:4100')
const proxyAiUrl = normalizeAiUrl(process.env.AP_AI_PROXY_URL || 'http://127.0.0.1:4101/api/ai')
const appAiUrl = normalizeAiUrl(process.env.AP_CHEM_AI_URL || 'http://127.0.0.1:3001/api/ai')
const shouldGenerate = process.argv.includes('--generate')

const checks = [
  {
    name: 'AI gateway health',
    run: () => expectJson(`${gatewayBaseUrl}/healthz`, {
      method: 'GET',
      expectedStatus: 200,
      expect: body => body.ok === true,
    }),
  },
  {
    name: 'AI gateway auth gate',
    run: () => expectJson(`${gatewayBaseUrl}/v1/generate`, {
      method: 'POST',
      expectedStatus: 401,
      body: {
        provider: 'codex',
        model: 'gpt-5.4-mini',
        prompt: 'auth probe',
      },
      expect: body => body.ok === false && body.error_type === 'unauthorized',
    }),
  },
  {
    name: 'AP AI proxy health',
    run: () => expectJson(healthUrlFor(proxyAiUrl), {
      method: 'GET',
      expectedStatus: 200,
      expect: body => body.ok === true,
    }),
  },
  {
    name: 'AP AI proxy request validation',
    run: () => expectJson(proxyAiUrl, {
      method: 'POST',
      expectedStatus: 400,
      body: {},
      expect: body => body.ok === false && body.error_type === 'invalid_request',
    }),
  },
  {
    name: 'AP Chemistry /api/ai forwarding',
    run: () => expectJson(appAiUrl, {
      method: 'POST',
      expectedStatus: 400,
      body: {},
      expect: body => body.ok === false && body.error_type === 'invalid_request',
    }),
  },
]

if (shouldGenerate) {
  checks.push({
    name: 'AP Chemistry /api/ai generation',
    run: () => expectJson(appAiUrl, {
      method: 'POST',
      expectedStatus: 200,
      timeoutMs: 30_000,
      body: {
        provider: 'codex',
        model: 'gpt-5.4-mini',
        reasoning_effort: 'low',
        json_mode: true,
        web_search: false,
        prompt: 'Return JSON only: {"ok":true}',
      },
      expect: body => body.ok === true && body.parsed_json?.ok === true,
    }),
  })
}

let failed = false
for (const check of checks) {
  try {
    await check.run()
    console.log(`ok - ${check.name}`)
  } catch (error) {
    failed = true
    console.error(`not ok - ${check.name}`)
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed) process.exitCode = 1

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '')
}

function normalizeAiUrl(value) {
  const url = new URL(value)
  if (url.pathname === '' || url.pathname === '/') url.pathname = '/api/ai'
  return url.toString()
}

function healthUrlFor(aiUrl) {
  const url = new URL(aiUrl)
  url.pathname = '/healthz'
  url.search = ''
  url.hash = ''
  return url.toString()
}

async function expectJson(url, options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000)
  try {
    const response = await fetch(url, {
      method: options.method,
      signal: controller.signal,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`expected JSON from ${url}, got ${JSON.stringify(text.slice(0, 160))}`)
    }

    if (response.status !== options.expectedStatus) {
      throw new Error(`expected HTTP ${options.expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`)
    }
    if (!options.expect(body)) {
      throw new Error(`unexpected response from ${url}: ${JSON.stringify(body)}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}
