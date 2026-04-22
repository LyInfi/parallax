// Runs once when the Next.js Node server starts, before any request handler
// executes. Used to install a global undici dispatcher so that ALL fetch()
// calls in API routes / provider adapters auto-route through the system proxy
// detected by the Electron main process (or set explicitly via env vars).

export async function register() {
  // Skip in edge runtime — undici dispatcher is Node-only.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { getProxyDispatcher, resolveProxyUri } = await import('./lib/server/proxy-dispatcher')
  const uri = resolveProxyUri()
  if (!uri) {
    console.log('[instrumentation] no proxy env detected; using direct connections')
    return
  }
  const dispatcher = await getProxyDispatcher()
  if (!dispatcher) {
    console.warn('[instrumentation] proxy URI present but dispatcher creation failed')
    return
  }
  try {
    const { setGlobalDispatcher } = (await import('undici')) as typeof import('undici')
    setGlobalDispatcher(dispatcher as never)
    console.log(`[instrumentation] global undici dispatcher set: ${uri}`)
  } catch (err) {
    console.warn('[instrumentation] setGlobalDispatcher failed:', err)
  }
}
