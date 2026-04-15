// 豆包 Seedream (火山方舟) Image Generation Adapter
// Docs: https://www.volcengine.com/docs/82379/1541523 (JS-rendered, not accessible via automated fetch)
//       https://www.volcengine.com/docs/82379/1824718
// TODO: Verify exact model ID at https://www.volcengine.com/docs/82379/1824121
//
// Endpoint: POST https://ark.cn-beijing.volces.com/api/v3/images/generations
// This is an OpenAI-compatible images/generations endpoint.
// Auth: Authorization: Bearer <ARK_API_KEY>
// Request body: { model, prompt, n, size, seed, response_format }
// Response: { data: [{ url: string } | { b64_json: string }] }
//
// Default model: doubao-seedream-4-0-250828
// Override via input.providerOverrides.model
//
// NOTE: 豆包 Seedream and 即梦 Seedream use the same 火山方舟 endpoint but different model IDs.
// The ARK_API_KEY is the Volcano Ark access key (获取方式: 火山方舟控制台 → API Key 管理).

import type { ProviderAdapter, GenerateEvent, GenerateInput, SizeSpec } from './types'
import { expectedDimensions } from './types'

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
// doubao-seedream-4-0-250828 is Seedream 4.0 GA model (confirmed via Volcengine product announcements)
const DEFAULT_MODEL = 'doubao-seedream-4-0-250828'

// Seedream 4.0 requires ≥ 3,686,400 pixels. Native size table per (aspect, tier).
const SEEDREAM_SIZE_TABLE: Record<string, Record<string, string>> = {
  '1:1':  { standard: '2048x2048', hd: '2048x2048', ultra: '2816x2816' },
  '16:9': { standard: '2560x1440', hd: '2560x1440', ultra: '3840x2160' },
  '9:16': { standard: '1440x2560', hd: '1440x2560', ultra: '2160x3840' },
  '4:3':  { standard: '2304x1728', hd: '2304x1728', ultra: '3072x2304' },
  '3:4':  { standard: '1728x2304', hd: '1728x2304', ultra: '2304x3072' },
}

export function doubaoResolveNative(spec: SizeSpec | undefined): string {
  // Legacy string pass-through: if a raw WxH string is provided, honour it directly.
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)[x*:×](\d+)$/i)
    if (m) return `${m[1]}x${m[2]}`
    // Non-WxH string (e.g. old preset) — fall through to default
  }
  const { aspect, tier } = expectedDimensions(spec, '1:1', 'hd').spec
  return SEEDREAM_SIZE_TABLE[aspect]?.[tier] ?? '2048x2048'
}

export const doubaoSeedreamProvider: ProviderAdapter = {
  id: 'doubao-seedream',
  displayName: '豆包 Seedream',
  defaultModel: DEFAULT_MODEL,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    maxImages: 4,
    // Seedream 4.0 requires at least 3,686,400 pixels per image
    sizes: ['2048x2048', '2304x1728', '1728x2304', '2560x1440', '1440x2560'],
    configFields: [
      {
        id: 'model',
        label: '模型 ID',
        placeholder: 'doubao-seedream-4-0-250828',
      },
    ],
  },

  async *generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    const model =
      typeof input.providerOverrides?.model === 'string'
        ? input.providerOverrides.model
        : DEFAULT_MODEL

    const size = doubaoResolveNative(input.size)
    const n = input.n ?? 1

    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      n,
      size,
      response_format: 'url',
    }

    if (input.seed !== undefined) {
      body.seed = input.seed
    }

    // Image-to-image: Seedream 4.0 supports an `image` field (string or array of strings).
    // Accept both data-URL and remote-URL forms already produced by the client.
    if (input.referenceImages && input.referenceImages.length > 0) {
      const imgs = input.referenceImages
        .map((r) => (typeof r === 'string' ? r : ''))
        .filter((s): s is string => Boolean(s))
      if (imgs.length === 1) body.image = imgs[0]
      else if (imgs.length > 1) body.image = imgs
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.status === 401) {
        yield { type: 'error', code: 'UNAUTHORIZED', message: 'Invalid API key', retryable: false }
        return
      }
      if (res.status === 429) {
        yield { type: 'error', code: 'RATE_LIMIT', message: 'Rate limited', retryable: true }
        return
      }
      if (!res.ok) {
        yield {
          type: 'error',
          code: `HTTP_${res.status}`,
          message: await res.text(),
          retryable: res.status >= 500,
        }
        return
      }

      const data = await res.json()
      const items: unknown[] = Array.isArray(data?.data) ? data.data : []

      let imageIndex = 0
      for (const item of items) {
        const it = item as Record<string, unknown>
        if (typeof it.url === 'string' && it.url) {
          yield { type: 'image', url: it.url, index: imageIndex++ }
        } else if (typeof it.b64_json === 'string' && it.b64_json) {
          yield { type: 'image', url: `data:image/png;base64,${it.b64_json}`, index: imageIndex++ }
        }
      }

      if (imageIndex === 0) {
        yield {
          type: 'error',
          code: 'NO_IMAGE',
          message: 'No image returned by 豆包 Seedream.',
          retryable: false,
        }
        return
      }

      yield { type: 'done' }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') {
        yield { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
        return
      }
      yield { type: 'error', code: 'NETWORK', message: err.message, retryable: true }
    }
  },
}
