// lib/providers/custom/chat.ts
import type { GenerateEvent } from '../types'
import { errorFromResponse, errorFromThrow, referenceDataUrls, type ProtocolArgs } from './shared'

export async function* generateViaChat(args: ProtocolArgs): AsyncIterable<GenerateEvent> {
  const { baseUrl, model, input, apiKey, signal } = args
  yield { type: 'queued' }

  const content: unknown[] = [{ type: 'text', text: input.prompt }]
  for (const url of referenceDataUrls(input)) {
    content.push({ type: 'image_url', image_url: { url } })
  }

  const body = {
    model,
    messages: [{ role: 'user', content }],
    modalities: ['image', 'text'],
  }

  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions'

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
    const choices: unknown[] = Array.isArray(data?.choices) ? data.choices : []
    let idx = 0
    for (const choice of choices) {
      const message = (choice as Record<string, unknown>)?.message as Record<string, unknown> | undefined
      const before = idx
      const images: unknown[] = Array.isArray(message?.images) ? (message.images as unknown[]) : []
      for (const img of images) {
        const iu = (img as Record<string, unknown>)?.image_url as Record<string, unknown> | undefined
        const url = typeof iu?.url === 'string' ? iu.url : undefined
        if (url) yield { type: 'image', url, index: idx++ }
      }
      if (idx === before) {
        const parts: unknown[] = Array.isArray(message?.content) ? (message.content as unknown[]) : []
        for (const part of parts) {
          const p = part as Record<string, unknown>
          if (p.type === 'image_url') {
            const iu = p.image_url as Record<string, unknown> | undefined
            const url = typeof iu?.url === 'string' ? iu.url : undefined
            if (url) yield { type: 'image', url, index: idx++ }
          }
        }
      }
    }

    if (idx === 0) {
      yield {
        type: 'error',
        code: 'NO_IMAGE',
        message: '端点返回 200 但响应里没有图片。检查模型是否支持图片输出。',
        retryable: false,
      }
      return
    }

    yield { type: 'done' }
  } catch (e) {
    yield errorFromThrow(e)
  }
}
