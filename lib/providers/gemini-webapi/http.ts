// Upstream: HanaokaYuzu/Gemini-API TS port. See NOTICE.md.

import { getProxyDispatcher } from '@/lib/server/proxy-dispatcher'

export function cookie_header(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

export function extract_set_cookie_value(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[;,\\s])${escaped}=([^;]+)`, 'i')
  const m = setCookie.match(re)
  return m?.[1] ?? null
}

function isTransientNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause
  const code = cause?.code
  if (code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return true
  }
  const msg = `${e.message ?? ''} ${cause?.message ?? ''}`.toLowerCase()
  return msg.includes('other side closed') || msg.includes('socket hang up')
}

async function fetchOnce(
  url: string,
  init: RequestInit & { timeout_ms?: number },
): Promise<Response> {
  const { timeout_ms, ...rest } = init
  const dispatcher = await getProxyDispatcher()
  const withProxy = dispatcher ? ({ ...rest, dispatcher } as RequestInit) : rest

  if (!timeout_ms || timeout_ms <= 0) return fetch(url, withProxy)

  const ctl = new AbortController()
  const upstream = withProxy.signal
  const onUpstreamAbort = () => ctl.abort()
  if (upstream) {
    if (upstream.aborted) ctl.abort()
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true })
  }
  const t = setTimeout(() => ctl.abort(), timeout_ms)
  try {
    return await fetch(url, { ...withProxy, signal: ctl.signal })
  } finally {
    clearTimeout(t)
    if (upstream) upstream.removeEventListener('abort', onUpstreamAbort)
  }
}

export async function fetch_with_timeout(
  url: string,
  init: RequestInit & { timeout_ms?: number; retries?: number } = {},
): Promise<Response> {
  const { retries, ...rest } = init
  const maxRetries = retries ?? 1
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOnce(url, rest)
    } catch (e) {
      lastErr = e
      if (attempt === maxRetries) break
      if (!isTransientNetworkError(e)) break
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw lastErr
}
