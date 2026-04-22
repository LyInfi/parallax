// On-demand refresh of __Secure-1PSIDTS via RotateCookies. No filesystem cache.
// Upstream: HanaokaYuzu/Gemini-API. See NOTICE.md.

import { Endpoint, Headers } from './constants'
import { AuthError } from './exceptions'
import { cookie_header, extract_set_cookie_value, fetch_with_timeout } from './http'

export async function rotate_1psidts(
  cookies: Record<string, string>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!cookies['__Secure-1PSID']) throw new Error('Missing __Secure-1PSID cookie.')

  const res = await fetch_with_timeout(Endpoint.ROTATE_COOKIES, {
    method: 'POST',
    headers: { ...Headers.ROTATE_COOKIES, Cookie: cookie_header(cookies) },
    body: '[000,"-0000000000000000000"]',
    redirect: 'follow',
    timeout_ms: 30_000,
    signal,
  })

  if (res.status === 401) throw new AuthError('Failed to refresh cookies (401).')
  if (!res.ok) throw new Error(`RotateCookies failed: ${res.status} ${res.statusText}`)

  const setCookie = res.headers.get('set-cookie')
  return extract_set_cookie_value(setCookie, '__Secure-1PSIDTS')
}
