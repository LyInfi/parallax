// __tests__/providers/custom.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { customProvider } from '@/lib/providers/custom'

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

describe('customProvider', () => {
  it('has correct metadata', () => {
    expect(customProvider.id).toBe('custom')
    expect(customProvider.displayName).toBe('自定义端点 (OpenAI 兼容)')
    expect(customProvider.capabilities.textToImage).toBe(true)
    expect(customProvider.capabilities.imageToImage).toBe(true)
    expect(customProvider.capabilities.maxImages).toBe(1)
    const fieldIds = (customProvider.capabilities.configFields ?? []).map(f => f.id)
    expect(fieldIds).toEqual(['baseUrl', 'model', 'protocol'])
  })

  it('missing baseUrl → CONFIG_MISSING, no fetch', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const events = await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { model: 'm', protocol: 'chat' } },
      'key',
      new AbortController().signal,
    ))
    expect(events.find((e) => (e as { type: string }).type === 'error')).toMatchObject({ code: 'CONFIG_MISSING', retryable: false })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('missing model → CONFIG_MISSING', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const events = await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', protocol: 'chat' } },
      'key',
      new AbortController().signal,
    ))
    expect(events.find((e) => (e as { type: string }).type === 'error')).toMatchObject({ code: 'CONFIG_MISSING' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('missing apiKey → CONFIG_MISSING', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const events = await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', model: 'm', protocol: 'chat' } },
      '',
      new AbortController().signal,
    ))
    expect(events.find((e) => (e as { type: string }).type === 'error')).toMatchObject({ code: 'CONFIG_MISSING' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('non-http baseUrl → CONFIG_INVALID', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const events = await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'ftp://nope', model: 'm', protocol: 'chat' } },
      'key',
      new AbortController().signal,
    ))
    expect(events.find((e) => (e as { type: string }).type === 'error')).toMatchObject({ code: 'CONFIG_INVALID' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('unknown protocol → CONFIG_INVALID', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const events = await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', model: 'm', protocol: 'magic' } },
      'key',
      new AbortController().signal,
    ))
    expect(events.find((e) => (e as { type: string }).type === 'error')).toMatchObject({ code: 'CONFIG_INVALID' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('dispatches chat → /chat/completions', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,A' } }] } }],
    }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', model: 'm', protocol: 'chat' } },
      'key',
      new AbortController().signal,
    ))
    expect(mockFetch.mock.calls[0][0]).toBe('https://a.com/v1/chat/completions')
  })

  it('dispatches images → /images/generations', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({ data: [{ b64_json: 'AA' }] }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', model: 'm', protocol: 'images' } },
      'key',
      new AbortController().signal,
    ))
    expect(mockFetch.mock.calls[0][0]).toBe('https://a.com/v1/images/generations')
  })

  it('defaults to chat when protocol is absent', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,A' } }] } }],
    }))
    vi.stubGlobal('fetch', mockFetch)
    await collect(customProvider.generate(
      { prompt: 'x', providerOverrides: { baseUrl: 'https://a.com/v1', model: 'm' } },
      'key',
      new AbortController().signal,
    ))
    expect(mockFetch.mock.calls[0][0]).toBe('https://a.com/v1/chat/completions')
  })
})
