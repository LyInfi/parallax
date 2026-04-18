// __tests__/providers/custom-chat.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateViaChat } from '@/lib/providers/custom/chat'

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  }
}

async function collect(gen: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const evt of gen) events.push(evt)
  return events
}

afterEach(() => vi.unstubAllGlobals())

const baseArgs = {
  baseUrl: 'https://api.example.com/v1',
  model: 'some-model',
  apiKey: 'key',
}

describe('generateViaChat', () => {
  it('happy path: queued → image → done', async () => {
    const imageUrl = 'data:image/png;base64,abc=='
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { images: [{ image_url: { url: imageUrl } }] } }],
    }))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'a cat' }, signal: ac.signal }))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toEqual({ type: 'image', url: imageUrl, index: 0 })
    expect(events[2]).toEqual({ type: 'done' })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('some-model')
    expect(body.modalities).toContain('image')
    expect(body.messages[0].role).toBe('user')
  })

  it('falls back to content-parts images', async () => {
    const imageUrl = 'data:image/png;base64,xyz=='
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content: [{ type: 'image_url', image_url: { url: imageUrl } }] } }],
    })))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(events.find((e: any) => e.type === 'image')).toEqual({ type: 'image', url: imageUrl, index: 0 })
  })

  it('embeds referenceImages as image_url parts', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,r' } }] } }],
    }))
    vi.stubGlobal('fetch', mockFetch)
    const ref = 'data:image/png;base64,REF=='
    await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x', referenceImages: [ref as unknown as Blob] }, signal: new AbortController().signal }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    const parts = body.messages[0].content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parts.find((p: any) => p.type === 'image_url')?.image_url?.url).toBe(ref)
  })

  it('401 → UNAUTHORIZED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('nope', 401)))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → RATE_LIMIT retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('slow down', 429)))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('500 → HTTP_500 retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('boom', 500)))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'HTTP_500', retryable: true })
  })

  it('200 without images → NO_IMAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ choices: [{ message: { content: 'just text' } }] })))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'NO_IMAGE', retryable: false })
  })

  it('network throw → NETWORK retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('AbortError → ABORTED not retryable', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })

  it('trailing slash in baseUrl does not produce double slashes', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,ok' } }] } }],
    }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(generateViaChat({ ...baseArgs, baseUrl: 'https://api.example.com/v1/', input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions')
  })

  it('prefers images[] over content-parts when both are present', async () => {
    const imagesUrl = 'data:image/png;base64,FROMIMAGES'
    const contentUrl = 'data:image/png;base64,FROMCONTENT'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{
        message: {
          images: [{ image_url: { url: imagesUrl } }],
          content: [{ type: 'image_url', image_url: { url: contentUrl } }],
        },
      }],
    })))
    const events = await collect(generateViaChat({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    const imageEvents = events.filter((e) => (e as { type: string }).type === 'image')
    expect(imageEvents).toHaveLength(1)
    expect(imageEvents[0]).toMatchObject({ type: 'image', url: imagesUrl, index: 0 })
  })
})
