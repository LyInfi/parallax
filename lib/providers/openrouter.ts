// OpenRouter Image Generation Adapter
// Docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Endpoint: POST https://openrouter.ai/api/v1/chat/completions
// Auth: Authorization: Bearer <key>
// Request body includes modalities: ["image", "text"] and model supporting image output.
// Response: choices[0].message.images[0].image_url.url (data:image/png;base64,...)
//
// Default model: google/gemini-2.5-flash-image (confirmed from OpenRouter image-gen docs).
// Override via input.providerOverrides.model

import type { ProviderAdapter, GenerateEvent, GenerateInput, SizeSpec } from './types'
import { expectedDimensions } from './types'

const DEFAULT_MODEL = 'google/gemini-2.5-flash-image'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

// Official OpenRouter aspect → native dimensions (per image_config docs)
const OR_ASPECT_DIMS: Record<string, string> = {
  '1:1': '1024×1024', '16:9': '1344×768', '9:16': '768×1344',
  '4:3': '1184×864', '3:4': '864×1184',
}

export function openrouterResolveNative(spec: SizeSpec | undefined): string {
  if (!spec) return '1024×1024'
  if (typeof spec === 'string') return spec
  const dim = OR_ASPECT_DIMS[spec.aspect] ?? '1024×1024'
  const tierLabel: Record<string, string> = { standard: '1K', hd: '2K', ultra: '4K' }
  return `${spec.aspect}${tierLabel[spec.tier] ? ` · ${tierLabel[spec.tier]}` : ''} (${dim})`
}

function buildMessages(input: GenerateInput) {
  const content: unknown[] = [{ type: 'text', text: input.prompt }]
  if (input.referenceImages && input.referenceImages.length > 0) {
    for (const img of input.referenceImages) {
      if (typeof img === 'string' && img.startsWith('data:')) {
        content.push({ type: 'image_url', image_url: { url: img } })
      }
    }
  }
  return [{ role: 'user', content }]
}

// OpenRouter image_config per https://openrouter.ai/docs/features/multimodal/image-generation
// Supported aspect_ratio: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
// image_size: "1K" | "2K" | "4K" (honored by models that support it, e.g. gemini-3.1-flash-image-preview)
function imageConfigFor(size: GenerateInput['size']): Record<string, string> | undefined {
  if (!size || typeof size === 'string') return undefined
  const tierMap: Record<string, string> = { standard: '1K', hd: '2K', ultra: '4K' }
  const cfg: Record<string, string> = { aspect_ratio: size.aspect }
  const imgSize = tierMap[size.tier]
  if (imgSize) cfg.image_size = imgSize
  return cfg
}

export const openrouterProvider: ProviderAdapter = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  defaultModel: DEFAULT_MODEL,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    maxImages: 1,
    sizes: ['1024x1024', '512x512', '1792x1024', '1024x1792'],
    configFields: [
      {
        id: 'model',
        label: '模型 ID（OpenRouter model slug）',
        placeholder: 'google/gemini-2.5-flash-image',
      },
    ],
  },

  async *generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    const model =
      typeof input.providerOverrides?.model === 'string'
        ? input.providerOverrides.model
        : DEFAULT_MODEL

    const imageConfig = imageConfigFor(input.size)
    const body: Record<string, unknown> = {
      model,
      messages: buildMessages(input),
      modalities: ['image', 'text'],
      ...(imageConfig && { image_config: imageConfig }),
    }

    // Pass n if specified (some models support it)
    if (input.n && input.n > 1) {
      body.n = input.n
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
      const choices: unknown[] = Array.isArray(data?.choices) ? data.choices : []

      let imageIndex = 0
      for (const choice of choices) {
        const message = (choice as Record<string, unknown>)?.message as Record<string, unknown> | undefined
        const images: unknown[] = Array.isArray(message?.images) ? (message.images as unknown[]) : []

        for (const img of images) {
          const imageUrl = (img as Record<string, unknown>)?.image_url as Record<string, unknown> | undefined
          const url = typeof imageUrl?.url === 'string' ? imageUrl.url : undefined
          if (url) {
            yield { type: 'image', url, index: imageIndex++ }
          }
        }

        // Fallback: some variants embed base64 in content parts
        const contentParts: unknown[] = Array.isArray(message?.content)
          ? (message.content as unknown[])
          : []
        for (const part of contentParts) {
          const p = part as Record<string, unknown>
          if (p.type === 'image_url') {
            const iu = p.image_url as Record<string, unknown> | undefined
            const url = typeof iu?.url === 'string' ? iu.url : undefined
            if (url) {
              yield { type: 'image', url, index: imageIndex++ }
            }
          }
        }
      }

      if (imageIndex === 0) {
        yield {
          type: 'error',
          code: 'NO_IMAGE',
          message: 'No image returned by OpenRouter. Ensure the model supports image output.',
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
