// 通义万相 Wan 2.7 Image Generation Adapter (Async Polling Pattern)
// Docs: https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference
//
// Endpoint (async): POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation
// Header required: X-DashScope-Async: enable
// Auth: Authorization: Bearer <DASHSCOPE_API_KEY>
//
// Request body:
//   { model, input: { messages: [{ role: "user", content: [{ text: "..." }] }] }, parameters: { size, n, watermark } }
//
// Create response: { output: { task_id, task_status: "PENDING" }, request_id }
// Poll GET /api/v1/tasks/<task_id>:
//   { output: { task_id, task_status: "PENDING|RUNNING|SUCCEEDED|FAILED|CANCELED|UNKNOWN",
//               choices: [{ message: { content: [{ image: "url", type: "image" }] } }] } }
//
// Default model: wan2.7-image-pro (supports up to 4K)
//   Alternative: wan2.7-image (faster, up to 2K)
// Override via input.providerOverrides.model
//
// Size values: "1K", "2K" (default), "4K" (pro only)
// Custom: "<width>*<height>" (total pixels within range, aspect ratio [1:8, 8:1])
// Note: Image URLs expire after 24 hours.

import type { ProviderAdapter, GenerateEvent, GenerateInput } from './types'

const CREATE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'
const TASK_URL = (id: string) =>
  `https://dashscope.aliyuncs.com/api/v1/tasks/${id}`
const CANCEL_URL = (id: string) =>
  `https://dashscope.aliyuncs.com/api/v1/tasks/${id}/cancel`

// wan2.7-image-pro: supports 1K/2K/4K, text-to-image only
// wan2.7-image: supports 1K/2K, faster variant
const DEFAULT_MODEL = 'wan2.7-image-pro'

export const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 60 // 120s total at 2s interval

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new Error('aborted'))
      },
      { once: true },
    )
  })
}

function mapHttpError(status: number, body: string): GenerateEvent {
  if (status === 401 || status === 403)
    return { type: 'error', code: 'UNAUTHORIZED', message: 'Invalid API key', retryable: false }
  if (status === 429)
    return { type: 'error', code: 'RATE_LIMIT', message: 'Rate limited', retryable: true }
  return {
    type: 'error',
    code: `HTTP_${status}`,
    message: body.slice(0, 500),
    retryable: status >= 500,
  }
}

export const wanxiangProvider: ProviderAdapter = {
  id: 'wanxiang',
  displayName: '通义万相 Wan 2.7',
  defaultModel: DEFAULT_MODEL,
  capabilities: {
    textToImage: true,
    imageToImage: false,
    maxImages: 4,
    // Preset sizes; custom WxH strings also accepted by the API
    sizes: ['1K', '2K', '4K'],
    configFields: [
      {
        id: 'model',
        label: '模型 ID（wan2.7-image-pro / wan2.7-image / wanx2.1-t2i-turbo ...）',
        placeholder: 'wan2.7-image-pro',
      },
    ],
  },

  async *generate(input: GenerateInput, apiKey: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    const model =
      typeof input.providerOverrides?.model === 'string'
        ? input.providerOverrides.model
        : DEFAULT_MODEL

    const size = input.size ?? '2K'
    const n = input.n ?? 1

    // Build message content: text prompt only (image-to-image not yet supported)
    const content: Array<Record<string, unknown>> = [{ text: input.prompt }]

    let taskId: string | undefined

    try {
      // Step 1: Create async task
      const createRes = await fetch(CREATE_URL, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [{ role: 'user', content }],
          },
          parameters: {
            size,
            n,
            watermark: false,
            ...(input.seed != null && { seed: input.seed }),
          },
        }),
      })

      if (!createRes.ok) {
        yield mapHttpError(createRes.status, await createRes.text())
        return
      }

      const createBody = await createRes.json()
      taskId = createBody?.output?.task_id as string | undefined

      if (!taskId) {
        yield {
          type: 'error',
          code: 'NO_TASK_ID',
          message: 'task_id missing from create response',
          retryable: false,
        }
        return
      }

      // Step 2: Poll task until SUCCEEDED / FAILED / CANCELED / UNKNOWN
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_INTERVAL_MS, signal)

        const pollRes = await fetch(TASK_URL(taskId), {
          signal,
          headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (!pollRes.ok) {
          yield mapHttpError(pollRes.status, await pollRes.text())
          return
        }

        const pollBody = await pollRes.json()
        const status = pollBody?.output?.task_status as string | undefined

        yield {
          type: 'progress',
          pct: Math.min(90, 10 + i * 4),
          message: status,
        }

        if (status === 'SUCCEEDED') {
          // Results in output.choices[].message.content[].image
          const choices: unknown[] = Array.isArray(pollBody?.output?.choices)
            ? pollBody.output.choices
            : []

          let imageIndex = 0
          for (const choice of choices) {
            const msgContent = (choice as Record<string, unknown>)?.message as
              | Record<string, unknown>
              | undefined
            const parts: unknown[] = Array.isArray(msgContent?.content)
              ? (msgContent.content as unknown[])
              : []
            for (const part of parts) {
              const p = part as Record<string, unknown>
              if (p.type === 'image' && typeof p.image === 'string' && p.image) {
                yield { type: 'image', url: p.image, index: imageIndex++ }
              }
            }
          }

          if (imageIndex === 0) {
            yield {
              type: 'error',
              code: 'NO_IMAGE',
              message: 'Task SUCCEEDED but no image URLs found in response',
              retryable: false,
            }
            return
          }

          yield { type: 'done' }
          return
        }

        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          yield {
            type: 'error',
            code: 'TASK_FAILED',
            message: (pollBody?.output?.message as string | undefined) ?? status ?? 'Task failed',
            retryable: false,
          }
          return
        }

        // PENDING / RUNNING → continue polling
      }

      yield {
        type: 'error',
        code: 'TIMEOUT',
        message: `Polling timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`,
        retryable: true,
      }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError' || err.message === 'aborted') {
        // Best-effort task cancellation
        if (taskId) {
          try {
            await fetch(CANCEL_URL(taskId), {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}` },
            })
          } catch {
            // swallow cancel errors
          }
        }
        yield { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
        return
      }
      yield { type: 'error', code: 'NETWORK', message: err.message, retryable: true }
    }
  },
}
