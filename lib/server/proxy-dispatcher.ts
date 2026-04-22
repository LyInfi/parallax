// Shared undici ProxyAgent factory.
//
// Local HTTP proxies (Clash, Surge, ShadowsocksX) frequently reset kept-alive
// sockets, surfacing as `UND_ERR_SOCKET · other side closed`. Forcing fresh
// TCP per request (pipelining=0, keepAliveTimeout=1ms) avoids it.
//
// SERVER-ONLY: imports `undici` and reads `process.env`. Never import from
// browser code paths.

let cached: { uri: string | null; dispatcher: unknown | null } | null = null

export function resolveProxyUri(): string | null {
  return (
    process.env.GEMINI_WEB_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    null
  )
}

export async function getProxyDispatcher(): Promise<unknown | null> {
  const uri = resolveProxyUri()
  if (cached && cached.uri === uri) return cached.dispatcher
  if (!uri) {
    cached = { uri: null, dispatcher: null }
    return null
  }
  try {
    const { ProxyAgent } = (await import('undici')) as typeof import('undici')
    const dispatcher = new ProxyAgent({
      uri,
      pipelining: 0,
      keepAliveTimeout: 1,
      keepAliveMaxTimeout: 1,
      connect: { timeout: 30_000 },
    })
    cached = { uri, dispatcher }
    return dispatcher
  } catch (err) {
    console.warn('[proxy] failed to create ProxyAgent:', err)
    cached = { uri, dispatcher: null }
    return null
  }
}
