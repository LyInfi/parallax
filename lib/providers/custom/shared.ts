// lib/providers/custom/shared.ts
import type { GenerateInput, GenerateEvent, SizeSpec } from '../types'
import { GenerateError } from '../types'

export type Protocol = 'chat' | 'images'

export interface ProtocolArgs {
  baseUrl: string
  model: string
  input: GenerateInput
  apiKey: string
  signal: AbortSignal
}

export function normalizeBaseUrl(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(s)) {
    throw new GenerateError('CONFIG_INVALID', 'baseUrl 必须以 http:// 或 https:// 开头', false)
  }
  return s
}

/** Map SizeSpec to OpenAI images/generations "size" string. */
export function sizeSpecToOpenAI(spec: SizeSpec | undefined): string {
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)[x*:×](\d+)$/i)
    if (m) return `${m[1]}x${m[2]}`
    return '1024x1024'
  }
  if (!spec) return '1024x1024'
  if (spec.aspect === '16:9') return '1792x1024'
  if (spec.aspect === '9:16') return '1024x1792'
  // 1:1, 4:3, 3:4 → fallback 1024x1024
  return '1024x1024'
}

/** Extract base64 data URLs from referenceImages (blob inputs unsupported here). */
export function referenceDataUrls(input: GenerateInput): string[] {
  const out: string[] = []
  for (const img of input.referenceImages ?? []) {
    if (typeof img === 'string' && img.startsWith('data:')) out.push(img)
  }
  return out
}

/** Truncate body for error messages (prevents huge UI toasts). */
export function truncate(s: string, n = 500): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

/** Classify fetch response into a GenerateEvent error, or null if ok. */
export async function errorFromResponse(res: Response): Promise<GenerateEvent | null> {
  if (res.ok) return null
  if (res.status === 401) {
    return { type: 'error', code: 'UNAUTHORIZED', message: 'Invalid API key', retryable: false }
  }
  if (res.status === 429) {
    return { type: 'error', code: 'RATE_LIMIT', message: 'Rate limited', retryable: true }
  }
  const body = await res.text().catch(() => '')
  return {
    type: 'error',
    code: `HTTP_${res.status}`,
    message: truncate(body),
    retryable: res.status >= 500,
  }
}

/** Classify a thrown fetch error into a GenerateEvent. */
export function errorFromThrow(e: unknown): GenerateEvent {
  const err = e as Error
  if (err?.name === 'AbortError') {
    return { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
  }
  return { type: 'error', code: 'NETWORK', message: err?.message ?? 'network error', retryable: true }
}
