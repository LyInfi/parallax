// Gemini Web (Unofficial) — reverse-engineered gemini.google.com frontend.
// See lib/providers/gemini-webapi/NOTICE.md for upstream credits + ToS notes.
//
// Auth: user pastes __Secure-1PSID and __Secure-1PSIDTS into Settings. Adapter
// uses them server-side, then emits `credential-refresh` SSE events when
// RotateCookies returns a new __Secure-1PSIDTS so the browser can update its
// localStorage transparently.
//
// Image flow: Gemini CDN URLs are cookie-gated and short-lived, so we download
// them server-side and return data:image/png;base64,... to the client (same
// shape as google-nano-banana-2.ts uses).

import type { GenerateEvent, GenerateInput, ProviderAdapter } from './types'
import {
  APIError,
  AuthError,
  GeminiError,
  GeminiClient,
  ImageGenerationError,
  ModelInvalid,
  TemporarilyBlocked,
  TimeoutError,
  UsageLimitExceeded,
  dataUrlToBytes,
} from './gemini-webapi'

const DEFAULT_MODEL = 'gemini-3.0-pro'

const DISCLAIMER = [
  'Gemini Web 使用 gemini.google.com 的非官方逆向协议，违反 Google ToS。',
  '风险自负：账号可能被限流或封禁；IP 可能被临时封（错误 1060）；cookie 短效需频繁刷新。',
  '仅在能接受上述风险的前提下使用，建议使用小号 + 独立代理/IP。',
].join(' ')

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...slice)
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64')
}

function parseCreds(raw: string): { psid: string; psidts: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AuthError('Gemini Web creds must be JSON {psid, psidts}')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new AuthError('Gemini Web creds must be a JSON object')
  }
  const obj = parsed as Record<string, unknown>
  const psid = typeof obj.psid === 'string' ? obj.psid : ''
  const psidts = typeof obj.psidts === 'string' ? obj.psidts : ''
  if (!psid) throw new AuthError('psid (__Secure-1PSID) is required')
  if (!psidts) throw new AuthError('psidts (__Secure-1PSIDTS) is required')
  return { psid, psidts }
}

function errorFromException(e: unknown): GenerateEvent {
  if (e instanceof AuthError) {
    return { type: 'error', code: 'BAD_CREDS', message: e.message, retryable: false }
  }
  if (e instanceof TemporarilyBlocked) {
    return { type: 'error', code: 'IP_BLOCKED', message: e.message, retryable: false }
  }
  if (e instanceof UsageLimitExceeded) {
    return { type: 'error', code: 'USAGE_LIMIT', message: e.message, retryable: false }
  }
  if (e instanceof ModelInvalid) {
    return { type: 'error', code: 'MODEL_INVALID', message: e.message, retryable: false }
  }
  if (e instanceof ImageGenerationError) {
    return { type: 'error', code: 'IMAGE_PARSE', message: e.message, retryable: true }
  }
  if (e instanceof TimeoutError) {
    return { type: 'error', code: 'TIMEOUT', message: e.message, retryable: true }
  }
  if (e instanceof APIError) {
    return { type: 'error', code: 'API_ERROR', message: e.message, retryable: true }
  }
  if (e instanceof GeminiError) {
    return { type: 'error', code: 'GEMINI_ERROR', message: e.message, retryable: false }
  }
  const err = e as Error & { cause?: unknown }
  if (err?.name === 'AbortError') {
    return { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
  }
  const parts = [err?.message ?? 'Unknown error']
  if (err?.cause) {
    const cause = err.cause as { code?: string; message?: string }
    if (cause.code) parts.push(`cause: ${cause.code}`)
    if (cause.message) parts.push(cause.message)
  }
  if (err?.message === 'fetch failed') {
    parts.push(
      'Tip: Node.js fetch does not use system proxy. Set HTTPS_PROXY=http://127.0.0.1:<port> (or GEMINI_WEB_PROXY) and restart the dev server.',
    )
  }
  return { type: 'error', code: 'NETWORK', message: parts.join(' · '), retryable: true }
}

export const geminiWebProvider: ProviderAdapter = {
  id: 'gemini-web',
  displayName: 'Gemini Web (Unofficial)',
  defaultModel: DEFAULT_MODEL,
  isExperimental: true,
  experimentalDisclaimer: DISCLAIMER,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    maxImages: 4,
    sizes: ['native'],
    keyFields: ['psid', 'psidts'],
    configFields: [
      {
        id: 'model',
        label: '模型',
        type: 'select',
        default: DEFAULT_MODEL,
        options: [
          { value: 'gemini-3.0-pro', label: 'Gemini 3 Pro' },
          { value: 'gemini-3.0-flash', label: 'Gemini 3 Flash' },
          { value: 'gemini-3.0-flash-thinking', label: 'Gemini 3 Flash Thinking' },
          { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
        ],
        hint: 'Gemini Web 不接受显式 size 参数；纵横比由模型决定。',
      },
    ],
  },

  async *generate(
    input: GenerateInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    let creds: { psid: string; psidts: string }
    try {
      creds = parseCreds(apiKey)
    } catch (e) {
      yield errorFromException(e)
      return
    }

    const modelName =
      typeof input.providerOverrides?.model === 'string'
        ? (input.providerOverrides.model as string)
        : DEFAULT_MODEL

    const client = new GeminiClient({ psid: creds.psid, psidts: creds.psidts, model: modelName })

    try {
      yield { type: 'progress', message: 'Authenticating with Gemini…' }
      await client.init(signal)
    } catch (e) {
      yield errorFromException(e)
      return
    }

    const uploads: Array<{ id: string; filename: string }> = []
    if (input.referenceImages && input.referenceImages.length > 0) {
      yield { type: 'progress', message: 'Uploading reference image(s)…' }
      try {
        for (const img of input.referenceImages) {
          if (typeof img === 'string' && img.startsWith('data:')) {
            const payload = dataUrlToBytes(img)
            const id = await client.uploadReference(payload, signal)
            uploads.push({ id, filename: payload.filename })
          }
        }
      } catch (e) {
        yield errorFromException(e)
        return
      }
    }

    yield { type: 'progress', message: 'Generating…' }

    let output
    try {
      output = await client.generateContent(input.prompt, { uploads, signal })
    } catch (e) {
      yield errorFromException(e)
      return
    }

    if (output.generatedImages.length === 0) {
      yield {
        type: 'error',
        code: 'NO_IMAGE',
        message:
          'Gemini did not return any generated image. The prompt may have been refused or the model does not produce images.',
        retryable: false,
      }
      return
    }

    yield { type: 'progress', message: 'Downloading image(s)…' }

    let index = 0
    for (const img of output.generatedImages) {
      if (signal.aborted) return
      try {
        const { bytes, contentType } = await client.downloadGeneratedImage(img.url, { signal })
        const base64 = bytesToBase64(bytes)
        yield { type: 'image', url: `data:${contentType};base64,${base64}`, index: index++ }
      } catch (e) {
        const err = e as Error
        if (err?.name === 'AbortError') {
          yield errorFromException(e)
          return
        }
        // Non-fatal: skip this image but keep trying siblings.
        yield {
          type: 'progress',
          message: `Skipping image (download failed): ${err?.message ?? 'unknown'}`,
        }
      }
    }

    if (index === 0) {
      yield {
        type: 'error',
        code: 'DOWNLOAD_FAILED',
        message: 'Could not download any of the generated images. Cookies may have expired.',
        retryable: true,
      }
      return
    }

    // Attempt to refresh __Secure-1PSIDTS. Failure is non-fatal.
    try {
      const newTs = await client.rotatePsidts(signal)
      if (newTs && newTs !== creds.psidts) {
        yield { type: 'credential-refresh', fields: { psidts: newTs } }
      }
    } catch {}

    yield { type: 'done' }
  },
}
