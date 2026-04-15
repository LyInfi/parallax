// Server-side image proxy to bypass CORS when fetching provider-hosted images
// (e.g. Volcengine CDN doesn't send Access-Control-Allow-Origin for cross-origin fetches).
// Usage: GET /api/proxy-image?url=<encoded-url>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_HOSTS = new Set<string>([
  'ark.cn-beijing.volces.com',
  'tos-cn-beijing.volces.com',
  'ark-content-generation-cn-beijing.tos-cn-beijing.volces.com',
  'ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com',
  'dashscope.aliyuncs.com',
  'dashscope-result-sh.oss-cn-shanghai.aliyuncs.com',
  'dashscope-result-bj.oss-cn-beijing.aliyuncs.com',
  'openai-production.s3.amazonaws.com',
  'oaidalleapiprodscus.blob.core.windows.net',
  'hunyuan.tencentcloudapi.com',
  'hunyuan-prod-1258344707.cos.ap-guangzhou.myqcloud.com',
])

function isAllowed(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true
  // Allow any subdomain of known provider root domains
  return /\.(volces\.com|aliyuncs\.com|myqcloud\.com|tencentcos\.cn|openrouter\.ai)$/.test(host)
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url')
  if (!url) return new Response('missing url', { status: 400 })
  let target: URL
  try { target = new URL(url) } catch { return new Response('bad url', { status: 400 }) }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return new Response('unsupported protocol', { status: 400 })
  }
  if (!isAllowed(target.hostname)) {
    return new Response(`host not allowed: ${target.hostname}`, { status: 403 })
  }
  try {
    const upstream = await fetch(target.toString(), { signal: req.signal })
    if (!upstream.ok || !upstream.body) {
      return new Response(`upstream ${upstream.status}`, { status: upstream.status })
    }
    const headers = new Headers()
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream'
    headers.set('content-type', ct)
    headers.set('cache-control', 'public, max-age=3600')
    return new Response(upstream.body, { headers })
  } catch (e) {
    return new Response((e as Error).message, { status: 502 })
  }
}
