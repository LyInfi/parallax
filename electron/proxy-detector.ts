import { session } from 'electron'

export type ProxyEnv = {
  HTTPS_PROXY?: string
  HTTP_PROXY?: string
  GEMINI_WEB_PROXY?: string
}

/**
 * Resolve the system proxy via Chromium's proxy resolver and return env vars
 * to inject into the spawned Next.js Node process. Honors macOS System Proxy,
 * Windows Internet Options, and Linux *_PROXY env vars.
 *
 * Resolves against the Anthropic API host so PAC scripts that route only
 * specific destinations through the proxy still produce the correct mapping.
 *
 * Returns an empty object on DIRECT/error so callers can spread unconditionally.
 */
export async function resolveSystemProxy(): Promise<ProxyEnv> {
  // If the user already exported HTTPS_PROXY before launching the app, respect it.
  // (instrumentation.ts will pick it up directly from process.env.)
  const inheritedHttps = process.env.HTTPS_PROXY || process.env.https_proxy
  const inheritedHttp = process.env.HTTP_PROXY || process.env.http_proxy
  if (inheritedHttps || inheritedHttp) {
    console.log(
      `[proxy] inheriting from shell env: HTTPS_PROXY=${inheritedHttps ?? '(unset)'} HTTP_PROXY=${inheritedHttp ?? '(unset)'}`,
    )
    return {}
  }

  try {
    const proxyList = await session.defaultSession.resolveProxy('https://api.anthropic.com')
    if (!proxyList || proxyList === 'DIRECT') {
      console.log('[proxy] system proxy resolver returned DIRECT — using direct connections')
      return {}
    }

    for (const entry of proxyList.split(';')) {
      const trimmed = entry.trim()
      if (!trimmed || trimmed === 'DIRECT') continue

      const httpMatch = trimmed.match(/^(?:PROXY|HTTPS)\s+([\w.-]+:\d+)$/i)
      if (httpMatch) {
        const url = `http://${httpMatch[1]}`
        console.log(`[proxy] system HTTP proxy detected via Chromium: ${url}`)
        return { HTTP_PROXY: url, HTTPS_PROXY: url, GEMINI_WEB_PROXY: url }
      }

      const socksMatch = trimmed.match(/^SOCKS5?\s+([\w.-]+:\d+)$/i)
      if (socksMatch) {
        const url = `socks5://${socksMatch[1]}`
        console.log(`[proxy] system SOCKS proxy detected via Chromium: ${url}`)
        return { HTTP_PROXY: url, HTTPS_PROXY: url, GEMINI_WEB_PROXY: url }
      }
    }
    console.log(`[proxy] proxy list did not match known patterns: ${proxyList}`)
  } catch (err) {
    console.warn('[proxy] resolveProxy failed:', err)
  }
  return {}
}
