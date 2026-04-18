// __tests__/providers/custom-images.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateViaImages } from '@/lib/providers/custom/images'

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
  model: 'dalle-ish',
  apiKey: 'k',
}

describe('generateViaImages', () => {
  it('happy path (b64_json): queued → image(data URL) → done', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      data: [{ b64_json: 'AAA=' }],
    }))
    vi.stubGlobal('fetch', mockFetch)

    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'cat' }, signal: new AbortController().signal }))
    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toEqual({ type: 'image', url: 'data:image/png;base64,AAA=', index: 0 })
    expect(events[2]).toEqual({ type: 'done' })

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/v1/images/generations')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('dalle-ish')
    expect(body.prompt).toBe('cat')
    expect(body.n).toBe(1)
    expect(body.size).toBe('1024x1024')
    expect(body.response_format).toBe('b64_json')
  })

  it('happy path (url): data[0].url is yielded directly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      data: [{ url: 'https://cdn.example.com/img.png' }],
    })))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toEqual({ type: 'image', url: 'https://cdn.example.com/img.png', index: 0 })
  })

  it('maps {aspect:16:9,tier:hd} to 1792x1024', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ data: [{ b64_json: 'A' }] }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x', size: { aspect: '16:9', tier: 'hd' } }, signal: new AbortController().signal }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.size).toBe('1792x1024')
  })

  it('passes through string size', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ data: [{ b64_json: 'A' }] }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x', size: '512x512' }, signal: new AbortController().signal }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.size).toBe('512x512')
  })

  it('attaches first referenceImage as body.image', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ data: [{ b64_json: 'A' }] }))
    vi.stubGlobal('fetch', mockFetch)
    const ref = 'data:image/png;base64,REF=='
    await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x', referenceImages: [ref as unknown as Blob] }, signal: new AbortController().signal }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.image).toBe(ref)
  })

  it('401 → UNAUTHORIZED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('nope', 401)))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → RATE_LIMIT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('slow', 429)))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('500 → HTTP_500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('boom', 500)))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'HTTP_500', retryable: true })
  })

  it('200 without data → NO_IMAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ data: [] })))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'NO_IMAGE', retryable: false })
  })

  it('network throw → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('abort → ABORTED', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
    const events = await collect(generateViaImages({ ...baseArgs, input: { prompt: 'x' }, signal: new AbortController().signal }))
    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })
})
