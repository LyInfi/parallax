// lib/providers/custom/images.ts
import type { GenerateEvent } from '../types'
import { errorFromResponse, errorFromThrow, referenceDataUrls, sizeSpecToOpenAI, type ProtocolArgs } from './shared'

export async function* generateViaImages(args: ProtocolArgs): AsyncIterable<GenerateEvent> {
  const { baseUrl, model, input, apiKey, signal } = args
  yield { type: 'queued' }

  const sizeStr = sizeSpecToOpenAI(input.size)
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: 1,
    size: sizeStr,         // OpenAI DALL-E
    image_size: sizeStr,   // SiliconFlow / some aggregators
    response_format: 'b64_json',
  }
  const refs = referenceDataUrls(input)
  if (refs.length > 0) body.image = refs[0]

  const endpoint = baseUrl.replace(/\/+$/, '') + '/images/generations'

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const errEvent = await errorFromResponse(res)
    if (errEvent) { yield errEvent; return }

    const data = await res.json()
    // OpenAI returns `data[]`; SiliconFlow returns `images[]`. Accept either.
    const items: unknown[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.images)
        ? data.images
        : []
    let idx = 0
    for (const item of items) {
      const it = item as Record<string, unknown>
      if (typeof it.b64_json === 'string' && it.b64_json.length > 0) {
        yield { type: 'image', url: `data:image/png;base64,${it.b64_json}`, index: idx++ }
        continue
      }
      if (typeof it.url === 'string' && it.url.length > 0) {
        yield { type: 'image', url: it.url, index: idx++ }
      }
    }

    if (idx === 0) {
      yield {
        type: 'error',
        code: 'NO_IMAGE',
        message: '端点返回 200 但响应里 data 数组为空或没有可用图片字段。',
        retryable: false,
      }
      return
    }

    yield { type: 'done' }
  } catch (e) {
    yield errorFromThrow(e)
  }
}
