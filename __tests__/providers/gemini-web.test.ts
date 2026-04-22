// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { geminiWebProvider } from '@/lib/providers/gemini-web'
import { Endpoint } from '@/lib/providers/gemini-webapi/constants'

const VALID_CREDS = JSON.stringify({ psid: 'sid-abc', psidts: 'sidts-1' })

async function collect(gen: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const evt of gen) out.push(evt)
  return out
}

function htmlWithSnl(token: string) {
  return new Response(`<html><script>var x = {"SNlM0e":"${token}"};</script></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}

function streamGenerateResponse(bodyJson: unknown[]): Response {
  // StreamGenerate returns newline-delimited JSON; extract_json_from_response
  // grabs the last valid line.
  const partBody = JSON.stringify(bodyJson)
  const outerPart = ['wrb.fr', 'stub', partBody, null]
  const wrapper = [outerPart]
  return new Response(JSON.stringify(wrapper), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build a minimal candidate array whose [4][0] contains a gg-dl URL so the
 *  image extractor's indexed path finds the URL at [12][7][0][*][0][3][3].
 */
function candidateWithImage(imgUrl: string) {
  const candidate: unknown[] = new Array(38).fill(null)
  candidate[0] = 'rcid-xyz'
  candidate[1] = ['Here is your image http://googleusercontent.com/image_generation_content/1']
  const imageEntry: unknown[] = new Array(4).fill(null)
  imageEntry[0] = [null, null, null, [null, null, null, imgUrl]]
  imageEntry[3] = [null, null, null, null, null, ['alt text'], 1]
  const img12 = new Array(8).fill(null)
  img12[7] = [[imageEntry]]
  candidate[12] = img12
  // bodyJson shape: [metadata, ..., index 4 = candidate list]
  const bodyJson: unknown[] = new Array(5).fill(null)
  bodyJson[1] = ['meta1', 'meta2', 'meta3']
  bodyJson[4] = [candidate]
  return bodyJson
}

function errorResponse1060() {
  // Build innermost → out so get_nested_value(responseJson, [0,5,2,0,1,0]) === 1060.
  const level6 = [1060]
  const level5 = [null, level6]
  const level4 = [level5]
  const level3 = [null, null, level4]
  const level2: unknown[] = new Array(6).fill(null)
  level2[5] = level3
  const responseJson = [level2]
  return new Response(JSON.stringify(responseJson), { status: 200 })
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function routeFetch(handlers: {
  google?: () => Response
  init?: () => Response
  generate?: () => Response
  image?: () => Response
  rotate?: () => Response
  upload?: () => Response
}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.startsWith(Endpoint.GOOGLE) && url === Endpoint.GOOGLE) {
      return handlers.google?.() ?? new Response('', { status: 200 })
    }
    if (url.startsWith(Endpoint.INIT)) {
      return handlers.init?.() ?? htmlWithSnl('tok-default')
    }
    if (url.startsWith(Endpoint.GENERATE)) {
      return handlers.generate?.() ?? new Response('', { status: 500 })
    }
    if (url.startsWith(Endpoint.ROTATE_COOKIES)) {
      return handlers.rotate?.() ?? new Response('', { status: 200 })
    }
    if (url.startsWith(Endpoint.UPLOAD)) {
      return handlers.upload?.() ?? new Response('', { status: 500 })
    }
    if (url.startsWith('https://lh3.googleusercontent.com/')) {
      return (
        handlers.image?.() ??
        new Response(PNG_BYTES, { status: 200, headers: { 'Content-Type': 'image/png' } })
      )
    }
    void init
    return new Response('', { status: 500 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geminiWebProvider', () => {
  it('has correct metadata and experimental flag', () => {
    expect(geminiWebProvider.id).toBe('gemini-web')
    expect(geminiWebProvider.isExperimental).toBe(true)
    expect(geminiWebProvider.capabilities.keyFields).toEqual(['psid', 'psidts'])
    expect(geminiWebProvider.capabilities.textToImage).toBe(true)
    expect(geminiWebProvider.capabilities.imageToImage).toBe(true)
  })

  it('emits BAD_CREDS when apiKey is not valid JSON', async () => {
    const events = await collect(
      geminiWebProvider.generate({ prompt: 'hi' }, 'not-json', new AbortController().signal),
    )
    expect(events[0]).toEqual({ type: 'queued' })
    expect(events[events.length - 1]).toMatchObject({
      type: 'error',
      code: 'BAD_CREDS',
      retryable: false,
    })
  })

  it('emits BAD_CREDS when psid missing', async () => {
    const events = await collect(
      geminiWebProvider.generate(
        { prompt: 'hi' },
        JSON.stringify({ psidts: 'only-this' }),
        new AbortController().signal,
      ),
    )
    expect(events[events.length - 1]).toMatchObject({
      type: 'error',
      code: 'BAD_CREDS',
      retryable: false,
    })
  })

  it('emits BAD_CREDS on init 401', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        init: () => new Response('', { status: 401 }),
      }),
    )
    const events = await collect(
      geminiWebProvider.generate({ prompt: 'hi' }, VALID_CREDS, new AbortController().signal),
    )
    const err = events[events.length - 1] as { type: string; code: string }
    expect(err.type).toBe('error')
    expect(err.code).toBe('BAD_CREDS')
  })

  it('emits IP_BLOCKED on error code 1060', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        generate: () => errorResponse1060(),
      }),
    )
    const events = await collect(
      geminiWebProvider.generate({ prompt: 'hi' }, VALID_CREDS, new AbortController().signal),
    )
    const err = events[events.length - 1] as { type: string; code: string }
    expect(err.type).toBe('error')
    expect(err.code).toBe('IP_BLOCKED')
  })

  it('happy path: emits image event (base64 data URL) and done', async () => {
    const imgUrl = 'https://lh3.googleusercontent.com/gg-dl/test-image'
    vi.stubGlobal(
      'fetch',
      routeFetch({
        generate: () => streamGenerateResponse(candidateWithImage(imgUrl)),
      }),
    )

    const events = await collect(
      geminiWebProvider.generate({ prompt: 'a cat' }, VALID_CREDS, new AbortController().signal),
    )

    const imageEvt = events.find((e): e is { type: 'image'; url: string; index: number } => {
      return typeof e === 'object' && e !== null && (e as { type?: string }).type === 'image'
    })
    expect(imageEvt).toBeDefined()
    expect(imageEvt!.url.startsWith('data:image/png;base64,')).toBe(true)
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('emits credential-refresh when RotateCookies returns new __Secure-1PSIDTS', async () => {
    const imgUrl = 'https://lh3.googleusercontent.com/gg-dl/test-image'
    vi.stubGlobal(
      'fetch',
      routeFetch({
        generate: () => streamGenerateResponse(candidateWithImage(imgUrl)),
        rotate: () =>
          new Response('', {
            status: 200,
            headers: { 'set-cookie': '__Secure-1PSIDTS=brand-new-value; Path=/; Secure' },
          }),
      }),
    )

    const events = await collect(
      geminiWebProvider.generate({ prompt: 'a dog' }, VALID_CREDS, new AbortController().signal),
    )

    const refresh = events.find((e) => (e as { type?: string }).type === 'credential-refresh') as
      | { type: 'credential-refresh'; fields: Record<string, string> }
      | undefined
    expect(refresh).toBeDefined()
    expect(refresh!.fields.psidts).toBe('brand-new-value')
  })
})
