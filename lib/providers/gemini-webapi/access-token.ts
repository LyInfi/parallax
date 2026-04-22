// Fetch SNlM0e access token from gemini.google.com/app using provided cookies.
// Trimmed from baoyu TS port (no filesystem, no Chrome CDP fallback).
// Upstream: HanaokaYuzu/Gemini-API. See NOTICE.md.

import { Endpoint, Headers } from './constants'
import { AuthError } from './exceptions'
import { cookie_header, extract_set_cookie_value, fetch_with_timeout } from './http'

async function fetch_google_nid_cookie(signal?: AbortSignal): Promise<Record<string, string>> {
  try {
    const res = await fetch_with_timeout(Endpoint.GOOGLE, { timeout_ms: 15_000, signal })
    const setCookie = res.headers.get('set-cookie')
    const nid = extract_set_cookie_value(setCookie, 'NID')
    if (nid) return { NID: nid }
  } catch {}
  return {}
}

export async function get_access_token(
  base_cookies: Record<string, string>,
  signal?: AbortSignal,
): Promise<[string, Record<string, string>]> {
  if (!base_cookies['__Secure-1PSID']) {
    throw new AuthError('Missing __Secure-1PSID cookie.')
  }

  const extra = await fetch_google_nid_cookie(signal)
  const cookies = { ...extra, ...base_cookies }

  const res = await fetch_with_timeout(Endpoint.INIT, {
    method: 'GET',
    headers: { ...Headers.GEMINI, Cookie: cookie_header(cookies) },
    redirect: 'follow',
    timeout_ms: 30_000,
    signal,
  })

  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`Init returned ${res.status}. Cookies likely expired or invalid.`)
  }
  if (!res.ok) {
    throw new AuthError(`Init failed: ${res.status} ${res.statusText}`)
  }

  const text = await res.text()
  const m = text.match(/"SNlM0e":"(.*?)"/)
  if (!m?.[1]) {
    throw new AuthError(
      'Missing SNlM0e in Gemini init response. Cookies may be expired — refresh __Secure-1PSID / __Secure-1PSIDTS.',
    )
  }
  return [m[1], cookies]
}
