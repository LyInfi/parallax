import { describe, it, expect, vi, afterEach } from 'vitest'
import { doubaoSeedreamProvider } from '@/lib/providers/doubao-seedream'

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

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

const IMAGE_URL = 'https://ark.example.com/generated/image-abc123.png'

function makeSuccessResponse(n = 1) {
  return {
    data: Array.from({ length: n }, () => ({ url: IMAGE_URL })),
    created: Date.now(),
  }
}

describe('doubaoSeedreamProvider', () => {
  it('has correct id and displayName', () => {
    expect(doubaoSeedreamProvider.id).toBe('doubao-seedream')
    expect(doubaoSeedreamProvider.displayName).toBe('豆包 Seedream')
  })

  it('happy path: queued → image → done', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'a mountain' }, 'ark-key-123', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toEqual({ type: 'image', url: IMAGE_URL, index: 0 })
    expect(events[2]).toEqual({ type: 'done' })

    // Verify request
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]
    expect(calledUrl).toBe(ENDPOINT)
    expect(calledInit.headers['Authorization']).toBe('Bearer ark-key-123')
    expect(calledInit.method).toBe('POST')

    const body = JSON.parse(calledInit.body)
    expect(body.model).toBe('doubao-seedream-4-0-250828')
    expect(body.prompt).toBe('a mountain')
    expect(body.n).toBe(1)
    // Default size is now 2048x2048 (aspect=1:1, tier=hd) — Seedream 4.0 minimum pixel requirement
    expect(body.size).toBe('2048x2048')
  })

  it('happy path with n=2: yields 2 image events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse(2))))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test', n: 2 }, 'key', ac.signal))

    const imageEvents = events.filter((e: unknown) => (e as { type: string }).type === 'image')
    expect(imageEvents).toHaveLength(2)
    expect(imageEvents[0]).toMatchObject({ index: 0 })
    expect(imageEvents[1]).toMatchObject({ index: 1 })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('b64_json response format works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ data: [{ b64_json: 'abc123==' }] })
      )
    )

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toEqual({ type: 'image', url: 'data:image/png;base64,abc123==', index: 0 })
  })

  it('respects providerOverrides.model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(
      doubaoSeedreamProvider.generate(
        { prompt: 'test', providerOverrides: { model: 'doubao-seedream-5-0-lite' } },
        'key',
        ac.signal
      )
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('doubao-seedream-5-0-lite')
  })

  it('respects input.size', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(doubaoSeedreamProvider.generate({ prompt: 'test', size: '768x1024' }, 'key', ac.signal))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.size).toBe('768x1024')
  })

  it('passes seed when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(doubaoSeedreamProvider.generate({ prompt: 'test', seed: 42 }, 'key', ac.signal))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.seed).toBe(42)
  })

  it('401 → error UNAUTHORIZED, retryable: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Unauthorized', 401)))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'bad-key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → error RATE_LIMIT, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Too Many Requests', 429)))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('500 → error HTTP_500, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Internal Server Error', 500)))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'HTTP_500', retryable: true })
  })

  it('network error → error NETWORK, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('AbortError → error ABORTED, retryable: false', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))

    const ac = new AbortController()
    const events = await collect(doubaoSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })
})
