// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hunyuanProvider, signTC3 } from '@/lib/providers/hunyuan'

const VALID_CREDS = JSON.stringify({ SecretId: 'AKIDtest123', SecretKey: 'secrettest456' })

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

describe('hunyuanProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct id and displayName', () => {
    expect(hunyuanProvider.id).toBe('hunyuan')
    expect(hunyuanProvider.displayName).toBe('腾讯混元生图')
  })

  it('has keyFields: SecretId, SecretKey', () => {
    expect(hunyuanProvider.capabilities.keyFields).toEqual(['SecretId', 'SecretKey'])
  })

  it('signing headers present: Authorization starts with TC3-HMAC-SHA256, X-TC-Action, X-TC-Timestamp numeric', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ Response: { ResultImage: 'https://x.com/img.png', RequestId: 'req1' } }),
    )

    const ac = new AbortController()
    await collect(hunyuanProvider.generate({ prompt: 'a cat' }, VALID_CREDS, ac.signal))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    const headers = init.headers as Record<string, string>

    expect(headers['Authorization']).toMatch(/^TC3-HMAC-SHA256 /)
    expect(headers['X-TC-Action']).toBe('TextToImageLite')
    expect(Number(headers['X-TC-Timestamp'])).toBeGreaterThan(0)
    expect(headers['X-TC-Version']).toBe('2023-09-01')
  })

  it('happy path: queued → image with url → done', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ Response: { ResultImage: 'https://x.com/img.png', RequestId: 'req2' } }),
    )

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'a mountain' }, VALID_CREDS, ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    expect(events).toContainEqual({ type: 'image', url: 'https://x.com/img.png', index: 0 })
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('auth failure: Response.Error → error with code AuthFailure, retryable: false', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        Response: {
          Error: { Code: 'AuthFailure', Message: 'invalid secret key' },
          RequestId: 'req3',
        },
      }),
    )

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      type: string; code: string; message: string; retryable: boolean
    }
    expect(errEvent).toBeDefined()
    expect(errEvent.code).toBe('AuthFailure')
    expect(errEvent.retryable).toBe(false)
  })

  it('missing creds: apiKey is not JSON → BAD_CREDS error', async () => {
    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, 'notjson', ac.signal))

    expect(events[0]).toEqual({ type: 'queued' })
    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('BAD_CREDS')
    expect(errEvent.retryable).toBe(false)
  })

  it('missing SecretId or SecretKey → MISSING_CREDS error', async () => {
    const ac = new AbortController()
    const events = await collect(
      hunyuanProvider.generate({ prompt: 'hi' }, JSON.stringify({ SecretId: 'only-id' }), ac.signal),
    )

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string
    }
    expect(errEvent.code).toBe('MISSING_CREDS')
  })

  it('HTTP 401 → UNAUTHORIZED, retryable: false', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('UNAUTHORIZED')
    expect(errEvent.retryable).toBe(false)
  })

  it('HTTP 429 → RATE_LIMIT, retryable: true', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('RATE_LIMIT')
    expect(errEvent.retryable).toBe(true)
  })

  it('network error → NETWORK, retryable: true', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'))

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('NETWORK')
    expect(errEvent.retryable).toBe(true)
  })

  it('AbortError → ABORTED, retryable: false', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    fetchMock.mockRejectedValueOnce(abortErr)

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('ABORTED')
    expect(errEvent.retryable).toBe(false)
  })

  it('RequestLimitExceeded API error → retryable: true', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        Response: {
          Error: { Code: 'RequestLimitExceeded', Message: 'too many requests' },
          RequestId: 'req4',
        },
      }),
    )

    const ac = new AbortController()
    const events = await collect(hunyuanProvider.generate({ prompt: 'hi' }, VALID_CREDS, ac.signal))

    const errEvent = events.find((e) => (e as { type: string }).type === 'error') as {
      code: string; retryable: boolean
    }
    expect(errEvent.code).toBe('RequestLimitExceeded')
    expect(errEvent.retryable).toBe(true)
  })
})

describe('signTC3 deterministic', () => {
  it('produces stable signature byte-for-byte across runs', () => {
    const fixedPayload = JSON.stringify({ Prompt: 'test', Resolution: '1024:1024', Num: 1, RspImgType: 'url' })
    const headers = signTC3({
      secretId: 'AKIDtest123',
      secretKey: 'secrettest456',
      host: 'hunyuan.tencentcloudapi.com',
      service: 'hunyuan',
      action: 'TextToImageLite',
      version: '2023-09-01',
      region: 'ap-guangzhou',
      payload: fixedPayload,
      timestamp: 1700000000,
    })

    // Computed once, verified stable:
    expect(headers['Authorization']).toBe(
      'TC3-HMAC-SHA256 Credential=AKIDtest123/2023-11-14/hunyuan/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=80beec0eaba51b52a0a13a82b28f67ddc21ec0c7c5e8172fbec2a12dad14abe8',
    )
    expect(headers['X-TC-Action']).toBe('TextToImageLite')
    expect(headers['X-TC-Timestamp']).toBe('1700000000')
    expect(headers['X-TC-Version']).toBe('2023-09-01')
    expect(headers['X-TC-Region']).toBe('ap-guangzhou')
  })

  it('different secrets produce different signatures', () => {
    const base = {
      host: 'hunyuan.tencentcloudapi.com',
      service: 'hunyuan',
      action: 'TextToImageLite',
      version: '2023-09-01',
      region: 'ap-guangzhou',
      payload: '{}',
      timestamp: 1700000000,
    }
    const h1 = signTC3({ ...base, secretId: 'ID1', secretKey: 'KEY1' })
    const h2 = signTC3({ ...base, secretId: 'ID2', secretKey: 'KEY2' })
    expect(h1['Authorization']).not.toBe(h2['Authorization'])
  })
})
