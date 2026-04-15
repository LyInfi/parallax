import { describe, it, expect, vi, afterEach } from 'vitest'
import { googleNanoBanana2Provider } from '@/lib/providers/google-nano-banana-2'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview'

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

async function collect(gen: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const evt of gen) events.push(evt)
  return events
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const SAMPLE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=='

function makeGeminiResponse(base64 = SAMPLE_BASE64) {
  return {
    candidates: [
      {
        content: {
          parts: [
            { text: 'Here is the image.' },
            { inlineData: { mimeType: 'image/png', data: base64 } },
          ],
        },
      },
    ],
  }
}

describe('googleNanoBanana2Provider', () => {
  it('has correct id and displayName', () => {
    expect(googleNanoBanana2Provider.id).toBe('google-nano-banana-2')
    expect(googleNanoBanana2Provider.displayName).toBe('Google Nano Banana 2')
  })

  it('happy path: queued → image → done', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeGeminiResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'a cat' }, 'my-api-key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({
      type: 'image',
      url: `data:image/png;base64,${SAMPLE_BASE64}`,
      index: 0,
    })
    expect(events[2]).toEqual({ type: 'done' })

    // Verify URL contains model and key
    const calledUrl: string = mockFetch.mock.calls[0][0]
    expect(calledUrl).toContain(`${BASE_URL}/${DEFAULT_MODEL}:generateContent`)
    expect(calledUrl).toContain('key=my-api-key')

    // Verify request body
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.contents[0].parts[0]).toEqual({ text: 'a cat' })
    expect(body.generationConfig.responseModalities).toContain('IMAGE')
  })

  it('uses x-goog-api-key header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeGeminiResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'goog-key-123', ac.signal))

    expect(mockFetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('goog-key-123')
  })

  it('respects providerOverrides.model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeGeminiResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(
      googleNanoBanana2Provider.generate(
        { prompt: 'test', providerOverrides: { model: 'gemini-2.0-flash-exp' } },
        'key',
        ac.signal
      )
    )

    const calledUrl: string = mockFetch.mock.calls[0][0]
    expect(calledUrl).toContain('gemini-2.0-flash-exp:generateContent')
  })

  it('passes referenceImages as inline_data parts', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeGeminiResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB'
    await collect(
      googleNanoBanana2Provider.generate(
        { prompt: 'style transfer', referenceImages: [dataUrl as unknown as Blob] },
        'key',
        ac.signal
      )
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const parts = body.contents[0].parts
    expect(parts[0]).toEqual({ text: 'style transfer' })
    expect(parts[1]).toMatchObject({
      inline_data: { mime_type: 'image/jpeg', data: '/9j/4AAQSkZJRgAB' },
    })
  })

  it('401 → error UNAUTHORIZED, retryable: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Unauthorized', 401)))

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'bad', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('403 → error UNAUTHORIZED, retryable: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Forbidden', 403)))

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'bad', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → error RATE_LIMIT, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Rate limited', 429)))

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('network error → error NETWORK, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('AbortError → error ABORTED, retryable: false', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })

  it('no image in response → error NO_IMAGE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          candidates: [{ content: { parts: [{ text: 'I cannot generate images.' }] } }],
        })
      )
    )

    const ac = new AbortController()
    const events = await collect(googleNanoBanana2Provider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'NO_IMAGE', retryable: false })
  })
})
