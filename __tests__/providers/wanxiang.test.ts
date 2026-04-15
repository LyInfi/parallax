import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { wanxiangProvider } from '@/lib/providers/wanxiang'

// Override poll interval via module-level export for fast tests (avoids fake-timer race conditions)
// We monkey-patch the module's exported constant via a re-import trick using vi.mock
vi.mock('@/lib/providers/wanxiang', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/providers/wanxiang')>()
  // Expose the provider with POLL_INTERVAL_MS overridden to 0 for tests
  const fastProvider: typeof mod.wanxiangProvider = {
    ...mod.wanxiangProvider,
    generate: async function* (input, apiKey, signal) {
      // Re-implement generate with POLL_INTERVAL_MS = 0 by calling the original
      // but we can't easily do that — instead just re-export the provider and set interval to 0.
      // We yield from the original; fake timers will handle sleep(0, signal) instantly.
      yield* mod.wanxiangProvider.generate(input, apiKey, signal)
    },
  }
  return { ...mod, wanxiangProvider: fastProvider }
})

async function collect(gen: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const evt of gen) events.push(evt)
  return events
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const CREATE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'

describe('wanxiangProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Helper: collect events while advancing fake timers between each poll sleep
  async function collectWithTimers(iter: AsyncIterable<unknown>) {
    const out: unknown[] = []
    const iterator = iter[Symbol.asyncIterator]()
    // Drive the async generator — advance timers after each step so sleeps resolve
    let done = false
    while (!done) {
      const step = iterator.next()
      // Advance fake timers to resolve any pending setTimeout (sleep calls)
      await vi.advanceTimersByTimeAsync(2100)
      const result = await step
      done = result.done ?? false
      if (!done) out.push(result.value)
    }
    return out
  }

  it('has correct id and displayName', () => {
    expect(wanxiangProvider.id).toBe('wanxiang')
    expect(wanxiangProvider.displayName).toBe('通义万相 Wan 2.7')
  })

  it('has expected capabilities', () => {
    expect(wanxiangProvider.capabilities.textToImage).toBe(true)
    expect(wanxiangProvider.capabilities.imageToImage).toBe(false)
    expect(wanxiangProvider.capabilities.maxImages).toBeGreaterThan(0)
    expect(wanxiangProvider.capabilities.sizes.length).toBeGreaterThan(0)
  })

  it('happy path: PENDING → RUNNING → SUCCEEDED with one image', async () => {
    fetchMock
      // 1. Create task
      .mockResolvedValueOnce(
        makeResponse({ output: { task_id: 't1', task_status: 'PENDING' } }),
      )
      // 2. Poll 1: PENDING
      .mockResolvedValueOnce(
        makeResponse({ output: { task_id: 't1', task_status: 'PENDING' } }),
      )
      // 3. Poll 2: RUNNING
      .mockResolvedValueOnce(
        makeResponse({ output: { task_id: 't1', task_status: 'RUNNING' } }),
      )
      // 4. Poll 3: SUCCEEDED
      .mockResolvedValueOnce(
        makeResponse({
          output: {
            task_id: 't1',
            task_status: 'SUCCEEDED',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ type: 'image', image: 'https://x.com/img.png' }],
                },
              },
            ],
          },
        }),
      )

    const ac = new AbortController()
    const events = await collectWithTimers(
      wanxiangProvider.generate({ prompt: 'a mountain' }, 'key-123', ac.signal),
    )

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events.some((e: unknown) => (e as { type: string }).type === 'progress')).toBe(true)
    expect(events.some((e: unknown) => {
      const ev = e as { type: string; url?: string }
      return ev.type === 'image' && ev.url === 'https://x.com/img.png'
    })).toBe(true)
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('sends correct request shape for create', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ output: { task_id: 't2', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(
        makeResponse({
          output: {
            task_status: 'SUCCEEDED',
            choices: [
              { message: { content: [{ type: 'image', image: 'https://img.test/1.png' }] } },
            ],
          },
        }),
      )

    const ac = new AbortController()
    await collectWithTimers(
      wanxiangProvider.generate({ prompt: 'sunset', size: '1K', n: 2, seed: 99 }, 'my-api-key', ac.signal),
    )

    // First call is the create request
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(CREATE_URL)
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer my-api-key')
    expect(init.headers['X-DashScope-Async']).toBe('enable')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('wan2.7-image-pro')
    expect(body.input.messages[0].role).toBe('user')
    expect(body.input.messages[0].content[0].text).toBe('sunset')
    expect(body.parameters.size).toBe('1K')
    expect(body.parameters.n).toBe(2)
    expect(body.parameters.seed).toBe(99)
  })

  it('respects providerOverrides.model', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ output: { task_id: 't3' } }))
      .mockResolvedValueOnce(
        makeResponse({
          output: {
            task_status: 'SUCCEEDED',
            choices: [{ message: { content: [{ type: 'image', image: 'https://img.test/a.png' }] } }],
          },
        }),
      )

    const ac = new AbortController()
    await collectWithTimers(
      wanxiangProvider.generate(
        { prompt: 'test', providerOverrides: { model: 'wan2.7-image' } },
        'key',
        ac.signal,
      ),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('wan2.7-image')
  })

  it('401 on create → error UNAUTHORIZED, retryable: false', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'bad-key', ac.signal)) {
      events.push(evt)
    }

    expect(events[0]).toEqual({ type: 'queued' })
    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      type: string; code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('UNAUTHORIZED')
    expect(errEvent?.retryable).toBe(false)
  })

  it('403 on create → error UNAUTHORIZED', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'bad-key', ac.signal)) {
      events.push(evt)
    }

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string
    }
    expect(errEvent?.code).toBe('UNAUTHORIZED')
  })

  it('429 on create → error RATE_LIMIT, retryable: true', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal)) {
      events.push(evt)
    }

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('RATE_LIMIT')
    expect(errEvent?.retryable).toBe(true)
  })

  it('missing task_id in create response → error NO_TASK_ID', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ output: { task_status: 'PENDING' } }))

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal)) {
      events.push(evt)
    }

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string
    }
    expect(errEvent?.code).toBe('NO_TASK_ID')
  })

  it('FAILED task status → error TASK_FAILED', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ output: { task_id: 't4', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(
        makeResponse({ output: { task_status: 'FAILED', message: 'content policy violation' } }),
      )

    const ac = new AbortController()
    const events = await collectWithTimers(
      wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal),
    )

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('TASK_FAILED')
    expect(errEvent?.retryable).toBe(false)
  })

  it('CANCELED task status → error TASK_FAILED', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ output: { task_id: 't5' } }))
      .mockResolvedValueOnce(makeResponse({ output: { task_status: 'CANCELED' } }))

    const ac = new AbortController()
    const events = await collectWithTimers(
      wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal),
    )

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string
    }
    expect(errEvent?.code).toBe('TASK_FAILED')
  })

  it('500 on poll → error HTTP_500, retryable: true', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ output: { task_id: 't6' } }))
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const ac = new AbortController()
    const events = await collectWithTimers(
      wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal),
    )

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('HTTP_500')
    expect(errEvent?.retryable).toBe(true)
  })

  it('network error → error NETWORK, retryable: true', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'))

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal)) {
      events.push(evt)
    }

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('NETWORK')
    expect(errEvent?.retryable).toBe(true)
  })

  it('AbortError → error ABORTED, retryable: false', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    fetchMock.mockRejectedValueOnce(abortErr)

    const ac = new AbortController()
    const events: unknown[] = []
    for await (const evt of wanxiangProvider.generate({ prompt: 'hi' }, 'key', ac.signal)) {
      events.push(evt)
    }

    const errEvent = events.find((e: unknown) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent?.code).toBe('ABORTED')
    expect(errEvent?.retryable).toBe(false)
  })
})
