// Google Nano Banana 2 (Gemini) Image Generation Adapter
// Docs: https://ai.google.dev/gemini-api/docs/image-generation
// Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<apiKey>
// Auth: API key as query param `key=<apiKey>` OR header `x-goog-api-key: <apiKey>`
// Request: contents[].parts[] with text and optional inline_data (for image-to-image)
// Response: candidates[0].content.parts[] — look for parts with inlineData.mimeType starting with "image/"
//   Convert to data:<mimeType>;base64,<data> URL for the image event.
//
// Default model: gemini-3.1-flash-image-preview (Nano Banana 2)
// Override via input.providerOverrides.model

import type { ProviderAdapter, GenerateEvent, GenerateInput } from './types'

const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

function buildParts(input: GenerateInput): unknown[] {
  const parts: unknown[] = [{ text: input.prompt }]

  // Handle referenceImages for image-to-image
  if (input.referenceImages && input.referenceImages.length > 0) {
    for (const img of input.referenceImages) {
      if (typeof img === 'string' && img.startsWith('data:')) {
        // Parse data URL: data:<mimeType>;base64,<data>
        const commaIdx = img.indexOf(',')
        const header = img.slice(5, commaIdx) // e.g. "image/png;base64"
        const mimeType = header.split(';')[0]
        const data = img.slice(commaIdx + 1)
        parts.push({ inline_data: { mime_type: mimeType, data } })
      }
      // Blob: skip — not available in the API route path
    }
  }

  return parts
}

// Map size string like "1024x1024" to imageConfig fields
function parseSize(size?: string): { aspectRatio?: string } {
  if (!size) return {}
  const [w, h] = size.split('x').map(Number)
  if (!w || !h) return {}

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(w, h)
  return { aspectRatio: `${w / d}:${h / d}` }
}

export const googleNanoBanana2Provider: ProviderAdapter = {
  id: 'google-nano-banana-2',
  displayName: 'Google Nano Banana 2',
  capabilities: {
    textToImage: true,
    imageToImage: true,
    maxImages: 1,
    sizes: ['1024x1024', '1024x1792', '1792x1024'],
    configFields: [
      {
        id: 'model',
        label: '模型 ID',
        placeholder: 'gemini-3.1-flash-image-preview',
      },
    ],
  },

  async *generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    const model =
      typeof input.providerOverrides?.model === 'string'
        ? input.providerOverrides.model
        : DEFAULT_MODEL

    const url = `${BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

    const { aspectRatio } = parseSize(input.size)

    const requestBody: Record<string, unknown> = {
      contents: [{ parts: buildParts(input) }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
      },
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      })

      if (res.status === 401 || res.status === 403) {
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
      const candidates: unknown[] = Array.isArray(data?.candidates) ? data.candidates : []

      let imageIndex = 0
      for (const candidate of candidates) {
        const candidateRecord = candidate as Record<string, unknown>
        const content = candidateRecord?.content as Record<string, unknown> | undefined
        const parts: unknown[] = Array.isArray(content?.parts)
          ? (content.parts as unknown[])
          : []

        for (const part of parts) {
          const p = part as Record<string, unknown>
          if (p.inlineData) {
            const inlineData = p.inlineData as Record<string, unknown>
            const mimeType = typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png'
            const base64Data = typeof inlineData.data === 'string' ? inlineData.data : ''
            if (base64Data) {
              const imageUrl = `data:${mimeType};base64,${base64Data}`
              yield { type: 'image', url: imageUrl, index: imageIndex++ }
            }
          }
        }
      }

      if (imageIndex === 0) {
        yield {
          type: 'error',
          code: 'NO_IMAGE',
          message: 'No image returned by Gemini. Ensure the model supports image output.',
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
