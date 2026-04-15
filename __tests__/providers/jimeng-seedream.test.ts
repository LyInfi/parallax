import { describe, it, expect, vi, afterEach } from 'vitest'
import { jimengSeedreamProvider } from '@/lib/providers/jimeng-seedream'

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

const IMAGE_URL = 'https://ark.example.com/generated/jimeng-abc123.png'

function makeSuccessResponse(n = 1) {
  return {
    data: Array.from({ length: n }, () => ({ url: IMAGE_URL })),
    created: Date.now(),
  }
}

describe('jimengSeedreamProvider', () => {
  it('has correct id and displayName', () => {
    expect(jimengSeedreamProvider.id).toBe('jimeng-seedream')
    expect(jimengSeedreamProvider.displayName).toBe('即梦 Seedream')
  })

  it('happy path: queued → image → done', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'a river' }, 'ark-key-456', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toEqual({ type: 'image', url: IMAGE_URL, index: 0 })
    expect(events[2]).toEqual({ type: 'done' })

    // Verify request
    const [calledUrl, calledInit] = mockFetch.mock.calls[0]
    expect(calledUrl).toBe(ENDPOINT)
    expect(calledInit.headers['Authorization']).toBe('Bearer ark-key-456')
    expect(calledInit.method).toBe('POST')

    const body = JSON.parse(calledInit.body)
    expect(body.model).toBe('jimeng-high-aes-general-v21-L')
    expect(body.prompt).toBe('a river')
    expect(body.n).toBe(1)
    // Default size is now 2048x2048 (aspect=1:1, tier=hd) — Seedream pixel minimum requirement
    expect(body.size).toBe('2048x2048')
  })

  it('uses different default model from doubao-seedream', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    // 即梦 uses jimeng- prefix model, NOT doubao- prefix
    expect(body.model).toMatch(/^jimeng-/)
    expect(body.model).not.toMatch(/^doubao-/)
  })

  it('happy path with n=3: yields 3 image events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse(3))))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test', n: 3 }, 'key', ac.signal))

    const imageEvents = events.filter((e: unknown) => (e as { type: string }).type === 'image')
    expect(imageEvents).toHaveLength(3)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('b64_json response format works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ data: [{ b64_json: 'jimengBase64==' }] })
      )
    )

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toEqual({ type: 'image', url: 'data:image/png;base64,jimengBase64==', index: 0 })
  })

  it('respects providerOverrides.model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(
      jimengSeedreamProvider.generate(
        { prompt: 'test', providerOverrides: { model: 'jimeng-t2i-xl' } },
        'key',
        ac.signal
      )
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('jimeng-t2i-xl')
  })

  it('respects input.size', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(jimengSeedreamProvider.generate({ prompt: 'test', size: '1280x720' }, 'key', ac.signal))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.size).toBe('1280x720')
  })

  it('passes seed when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(jimengSeedreamProvider.generate({ prompt: 'test', seed: 999 }, 'key', ac.signal))

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.seed).toBe(999)
  })

  it('401 → error UNAUTHORIZED, retryable: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Unauthorized', 401)))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'bad-key', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[1]).toMatchObject({ type: 'error', code: 'UNAUTHORIZED', retryable: false })
  })

  it('429 → error RATE_LIMIT, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Too Many Requests', 429)))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'RATE_LIMIT', retryable: true })
  })

  it('500 → error HTTP_500, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Server Error', 500)))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'HTTP_500', retryable: true })
  })

  it('network error → error NETWORK, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS resolution failed')))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'NETWORK', retryable: true })
  })

  it('AbortError → error ABORTED, retryable: false', async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))

    const ac = new AbortController()
    const events = await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(events[1]).toMatchObject({ type: 'error', code: 'ABORTED', retryable: false })
  })

  it('same endpoint as doubao-seedream but different model', async () => {
    // Both providers share the ark endpoint but with different model IDs
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(makeSuccessResponse()))
    vi.stubGlobal('fetch', mockFetch)

    const ac = new AbortController()
    await collect(jimengSeedreamProvider.generate({ prompt: 'test' }, 'key', ac.signal))

    expect(mockFetch.mock.calls[0][0]).toBe(ENDPOINT)
  })
})
