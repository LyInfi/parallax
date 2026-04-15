import { describe, it, expect, vi, afterEach } from 'vitest'
import { openrouterProvider } from '@/lib/providers/openrouter'

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

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

describe('openrouterProvider', () => {
  it('has correct id and displayName', () => {
    expect(openrouterProvider.id).toBe('openrouter')
    expect(openrouterProvider.displayName).toBe('OpenRouter')
  })

  it('happy path: queued → image → done', async () => {
    const imageUrl = 'data:image/png;base64,abc123=='
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'A sunset.',
              images: [{ type: 'image_url', image_url: { url: imageUrl } }],
            },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'a sunset' }, 'test-key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toEqual({ type: 'image', url: imageUrl, index: 0 })
    expect(events[2]).toEqual({ type: 'done' })

    // Verify request shape
    expect(mockFetch).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    )

    const call = mockFetch.mock.calls[0][1]
    const parsedBody = JSON.parse(call.body)
    expect(parsedBody.modalities).toContain('image')
    expect(parsedBody.model).toBe('google/gemini-2.5-flash-image')
    expect(parsedBody.messages[0].role).toBe('user')
  })

  it('happy path: image in content parts fallback', async () => {
    const imageUrl = 'data:image/png;base64,xyz=='
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: [{ type: 'image_url', image_url: { url: imageUrl } }],
            },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    const imageEvents = events.filter((e: unknown) => (e as { type: string }).type === 'image')
    expect(imageEvents).toHaveLength(1)
    expect(imageEvents[0]).toMatchObject({ type: 'image', url: imageUrl, index: 0 })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('respects providerOverrides.model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse({
        choices: [
          {
            message: {
              images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,x' } }],
            },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(
      openrouterProvider.generate(
        { prompt: 'test', providerOverrides: { model: 'custom/model-v1' } },
        'key',
        ac.signal
      )
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('custom/model-v1')
  })

  it('401 → error UNAUTHORIZED, retryable: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Unauthorized', 401)))

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'test' }, 'bad-key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → error RATE_LIMIT, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Too Many Requests', 429)))

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('network error → error NETWORK, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('AbortError → error ABORTED, retryable: false', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))

    const ac = new AbortController()
    const events = await collect(openrouterProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })

  it('passes referenceImages as image_url parts', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse({
        choices: [
          {
            message: {
              images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,result' } }],
            },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const dataUrl = 'data:image/png;base64,referencedata=='
    await collect(
      openrouterProvider.generate(
        { prompt: 'test', referenceImages: [dataUrl as unknown as Blob] },
        'key',
        ac.signal
      )
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const content = body.messages[0].content
    const imagePart = content.find((p: { type: string }) => p.type === 'image_url')
    expect(imagePart?.image_url?.url).toBe(dataUrl)
  })
})
