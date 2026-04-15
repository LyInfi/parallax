// Fetch an image URL as a Blob, using /api/proxy-image for cross-origin sources
// to bypass CORS on provider CDNs (Volcengine, Aliyun OSS, etc.).
// data:/blob:/same-origin URLs are fetched directly.

export async function fetchImageBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    return res.blob()
  }
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    const sameOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin
    const fetchUrl = sameOrigin ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`
    const res = await fetch(fetchUrl)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    return res.blob()
  } catch {
    // Fallback: try direct fetch (may hit CORS but worth attempting)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    return res.blob()
  }
}
