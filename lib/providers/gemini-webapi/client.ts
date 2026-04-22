// Minimal single-shot Gemini Web client. No auto-refresh timer, no ChatSession, no Gems.
// Derived from JimLiu/baoyu-skills TS port of HanaokaYuzu/Gemini-API. See NOTICE.md.

import { Endpoint, ErrorCode, Headers, Model } from './constants'
import {
  APIError,
  AuthError,
  GeminiError,
  ImageGenerationError,
  ModelInvalid,
  TemporarilyBlocked,
  TimeoutError,
  UsageLimitExceeded,
} from './exceptions'
import { get_access_token } from './access-token'
import { cookie_header, fetch_with_timeout } from './http'
import { collect_strings, extract_json_from_response, get_nested_value } from './parsing'
import { rotate_1psidts } from './rotate'
import { upload_file, type UploadInput } from './upload'

export interface GeneratedImage {
  url: string
  title: string
  alt: string
}

export interface GenerateOutput {
  text: string
  thoughts: string | null
  generatedImages: GeneratedImage[]
}

export interface GeminiClientOptions {
  psid: string
  psidts?: string
  model?: Model | string
  timeoutMs?: number
}

export class GeminiClient {
  public cookies: Record<string, string>
  public model: Model
  public timeoutMs: number
  public accessToken: string | null = null

  constructor(opts: GeminiClientOptions) {
    if (!opts.psid) throw new AuthError('psid (__Secure-1PSID) is required')
    this.cookies = { '__Secure-1PSID': opts.psid }
    if (opts.psidts) this.cookies['__Secure-1PSIDTS'] = opts.psidts
    this.model =
      typeof opts.model === 'string' ? Model.from_name(opts.model) : opts.model ?? Model.UNSPECIFIED
    this.timeoutMs = opts.timeoutMs ?? 300_000
  }

  async init(signal?: AbortSignal): Promise<void> {
    const [token, cookies] = await get_access_token(this.cookies, signal)
    this.accessToken = token
    this.cookies = cookies
  }

  /**
   * Refresh __Secure-1PSIDTS via RotateCookies.
   * Returns the new value if refreshed, or null if no rotation occurred.
   * Mutates this.cookies on success.
   */
  async rotatePsidts(signal?: AbortSignal): Promise<string | null> {
    const newTs = await rotate_1psidts(this.cookies, signal)
    if (newTs) this.cookies['__Secure-1PSIDTS'] = newTs
    return newTs
  }

  async uploadReference(input: UploadInput, signal?: AbortSignal): Promise<string> {
    return upload_file(input, signal)
  }

  cookieHeader(): string {
    return cookie_header(this.cookies)
  }

  async generateContent(
    prompt: string,
    opts: { uploads?: Array<{ id: string; filename: string }>; signal?: AbortSignal } = {},
  ): Promise<GenerateOutput> {
    if (!this.accessToken) throw new APIError('Client not initialized. Call init() first.')
    if (!prompt) throw new Error('Prompt cannot be empty.')

    const { uploads, signal } = opts

    const uploadPayload =
      uploads && uploads.length > 0 ? uploads.map((u) => [[u.id], u.filename]) : null

    const first = uploadPayload ? [prompt, 0, null, uploadPayload] : [prompt]
    const inner: unknown[] = [first, null, null]
    const fReq = JSON.stringify([null, JSON.stringify(inner)])
    const body = new URLSearchParams({ at: this.accessToken, 'f.req': fReq }).toString()

    const headers = {
      ...Headers.GEMINI,
      ...this.model.model_header,
      Cookie: cookie_header(this.cookies),
    }

    let res: Response
    try {
      res = await fetch_with_timeout(Endpoint.GENERATE, {
        method: 'POST',
        headers,
        body,
        redirect: 'follow',
        timeout_ms: this.timeoutMs,
        signal,
      })
    } catch (e) {
      throw new TimeoutError(
        `StreamGenerate request failed or timed out: ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    if (res.status !== 200) {
      throw new APIError(`StreamGenerate returned status ${res.status}`)
    }

    const txt = await res.text()
    let responseJson: unknown
    try {
      responseJson = extract_json_from_response(txt)
    } catch {
      // Response wasn't newline-delimited JSON at all — likely HTML redirect,
      // login page, region block, or account without Gemini access.
      const looksLikeHtml = /<html|<!doctype/i.test(txt.slice(0, 200))
      const contentType = res.headers.get('content-type') ?? 'unknown'
      const sample = txt.slice(0, 400).replace(/\s+/g, ' ').trim()
      throw new APIError(
        `Gemini StreamGenerate returned non-JSON body (${looksLikeHtml ? 'HTML' : 'unknown'}, content-type=${contentType}). ` +
          `Common causes: cookies valid for init but rejected by generate endpoint; account has no Gemini access; region-blocked; proxy interference. ` +
          `Body sample: ${sample || '<empty>'}`,
      )
    }

    let bodyJson: unknown[] | null = null
    let bodyIndex = 0

    if (Array.isArray(responseJson)) {
      for (let i = 0; i < responseJson.length; i++) {
        const part = responseJson[i]
        if (!Array.isArray(part)) continue
        const partBody = get_nested_value<string | null>(part, [2], null)
        if (!partBody) continue
        try {
          const partJson = JSON.parse(partBody) as unknown[]
          if (get_nested_value(partJson, [4], null)) {
            bodyIndex = i
            bodyJson = partJson
            break
          }
        } catch {}
      }
    }

    if (!bodyJson) {
      // Try to decode numeric error code from common error envelope path
      const code = get_nested_value<number>(responseJson, [0, 5, 2, 0, 1, 0], -1)
      if (code === ErrorCode.USAGE_LIMIT_EXCEEDED) {
        throw new UsageLimitExceeded(
          `Gemini usage limit exceeded for model ${this.model.model_name}. Try a different model.`,
        )
      }
      if (code === ErrorCode.MODEL_INCONSISTENT) {
        throw new ModelInvalid(
          'Model inconsistent with chat metadata. (Multi-turn not supported in this build.)',
        )
      }
      if (code === ErrorCode.MODEL_HEADER_INVALID) {
        throw new ModelInvalid(
          'Model header invalid. The Gemini Web model hash may have changed — update constants.ts.',
        )
      }
      if (code === ErrorCode.IP_TEMPORARILY_BLOCKED) {
        throw new TemporarilyBlocked(
          'Your IP is temporarily blocked by Google. Use a proxy or wait before retrying.',
        )
      }
      throw new APIError(
        `Failed to parse Gemini response body. Upstream sample: ${txt.slice(0, 300)}`,
      )
    }

    const candidates = get_nested_value<unknown[]>(bodyJson, [4], [])
    if (!candidates.length) {
      throw new GeminiError('No candidates in Gemini response.')
    }

    const candidate = candidates[0]
    if (!Array.isArray(candidate)) {
      throw new GeminiError('Malformed candidate in Gemini response.')
    }

    let text = String(get_nested_value(candidate, [1, 0], ''))
    if (/^http:\/\/googleusercontent\.com\/card_content\/\d+/.test(text)) {
      text = String(get_nested_value(candidate, [22, 0], text))
    }
    const thoughts = get_nested_value<string | null>(candidate, [37, 0, 0], null)

    const wantsGenerated =
      get_nested_value(candidate, [12, 7, 0], null) != null ||
      /http:\/\/googleusercontent\.com\/image_generation_content\/\d+/.test(text)

    const generatedImages: GeneratedImage[] = []
    if (wantsGenerated) {
      let imgBody: unknown[] | null = null
      const parts = Array.isArray(responseJson) ? responseJson : []
      for (let i = bodyIndex; i < parts.length; i++) {
        const part = parts[i]
        if (!Array.isArray(part)) continue
        const partBody = get_nested_value<string | null>(part, [2], null)
        if (!partBody) continue
        try {
          const partJson = JSON.parse(partBody) as unknown[]
          const cand = get_nested_value<unknown>(partJson, [4, 0], null)
          if (!cand) continue
          const urls = collect_strings(
            cand,
            (s) => s.startsWith('https://lh3.googleusercontent.com/gg-dl/'),
            1,
          )
          if (urls.length > 0) {
            imgBody = partJson
            break
          }
        } catch {}
      }

      if (!imgBody) {
        throw new ImageGenerationError(
          'Could not find generated image data in Gemini response. Protocol may have changed.',
        )
      }

      const imgCandidate = get_nested_value<unknown[]>(imgBody, [4, 0], [])
      const finished = get_nested_value<string | null>(imgCandidate, [1, 0], null)
      if (finished) {
        text = finished
          .replace(/http:\/\/googleusercontent\.com\/image_generation_content\/\d+/g, '')
          .trimEnd()
      }

      const gen = get_nested_value<unknown[]>(imgCandidate, [12, 7, 0], [])
      for (let i = 0; i < gen.length; i++) {
        const g = gen[i]
        if (!Array.isArray(g)) continue
        const url = get_nested_value<string | null>(g, [0, 3, 3], null)
        if (!url) continue
        const imgNum = get_nested_value<number | null>(g, [3, 6], null)
        const title = imgNum ? `[Generated Image ${imgNum}]` : '[Generated Image]'
        const altList = get_nested_value<unknown[]>(g, [3, 5], [])
        const alt =
          (typeof altList[i] === 'string' ? (altList[i] as string) : null) ??
          (typeof altList[0] === 'string' ? (altList[0] as string) : '') ??
          ''
        generatedImages.push({ url, title, alt })
      }

      if (generatedImages.length === 0) {
        const urls = collect_strings(
          imgCandidate,
          (s) => s.startsWith('https://lh3.googleusercontent.com/gg-dl/'),
          4,
        )
        for (const url of urls) {
          generatedImages.push({ url, title: '[Generated Image]', alt: '' })
        }
      }
    }

    return { text, thoughts, generatedImages }
  }

  /**
   * Download a generated image URL with this client's cookies. Returns raw bytes + content-type.
   * Use `=s2048` suffix for full-size by default.
   */
  async downloadGeneratedImage(
    url: string,
    opts: { fullSize?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const target = opts.fullSize === false ? url : `${url}=s2048`
    const headers: Record<string, string> = {
      'User-Agent': Headers.GEMINI['User-Agent'],
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://gemini.google.com/',
      Cookie: cookie_header(this.cookies),
    }

    let current = target
    let res: Response | null = null
    for (let i = 0; i < 10; i++) {
      res = await fetch_with_timeout(current, {
        method: 'GET',
        headers,
        redirect: 'manual',
        timeout_ms: 60_000,
        signal: opts.signal,
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) break
        current = new URL(loc, current).toString()
        continue
      }
      break
    }
    if (!res) throw new Error('Image download: no response')
    if (!res.ok) throw new Error(`Image download failed: ${res.status} ${res.statusText}`)

    const buf = await res.arrayBuffer()
    return { bytes: new Uint8Array(buf), contentType: res.headers.get('content-type') ?? 'image/png' }
  }
}
