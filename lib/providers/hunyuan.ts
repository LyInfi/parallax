import { createHash, createHmac } from 'node:crypto'
import type { ProviderAdapter, GenerateEvent, SizeSpec } from './types'
import { expectedDimensions } from './types'

function sha256hex(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex')
}

function hmac(key: Buffer | string, msg: string): Buffer {
  return createHmac('sha256', key).update(msg).digest()
}

export function signTC3({
  secretId,
  secretKey,
  host,
  service,
  action,
  version,
  region,
  payload,
  timestamp,
}: {
  secretId: string
  secretKey: string
  host: string
  service: string
  action: string
  version: string
  region: string
  payload: string
  timestamp: number
}): Record<string, string> {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10) // YYYY-MM-DD
  const algorithm = 'TC3-HMAC-SHA256'
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  // canonical headers: lowercase key:value\n, sorted by key
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedRequestPayload = sha256hex(payload)
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = sha256hex(canonicalRequest)
  const stringToSign = [algorithm, String(timestamp), credentialScope, hashedCanonicalRequest].join('\n')

  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization =
    `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': region,
  }
}

// Hunyuan has fixed Resolution values in colon-separated format.
// Map aspect to nearest fixed resolution; tier is ignored.
export function hunyuanResolveNative(spec: SizeSpec | undefined): string {
  if (typeof spec === 'string') {
    // Legacy format: might already be "1024:1024" or "768:1024" etc.
    if (/^\d+:\d+$/.test(spec)) return spec
    // Try to infer aspect from WxH
    const m = spec.match(/^(\d+)[x*×](\d+)$/i)
    if (m) {
      const { spec: s } = expectedDimensions(spec, '1:1', 'hd')
      return aspectToHunyuan(s.aspect)
    }
    return '1024:1024'
  }
  const { aspect } = expectedDimensions(spec, '1:1', 'hd').spec
  return aspectToHunyuan(aspect)
}

function aspectToHunyuan(aspect: string): string {
  switch (aspect) {
    case '1:1': return '1024:1024'
    case '9:16':
    case '3:4':  return '768:1024'
    case '16:9':
    case '4:3':  return '1024:768'
    default:     return '1024:1024'
  }
}

export const hunyuanProvider: ProviderAdapter = {
  id: 'hunyuan',
  displayName: '腾讯混元生图',
  capabilities: {
    textToImage: true,
    imageToImage: false,
    maxImages: 4,
    sizes: ['1024:1024', '768:1024', '1024:768', '768:768'],
    keyFields: ['SecretId', 'SecretKey'],
    configFields: [
      {
        id: 'region',
        label: '地域（ap-guangzhou / ap-beijing / ap-shanghai ...）',
        placeholder: 'ap-guangzhou',
      },
    ],
  },

  async *generate(input, apiKey, signal): AsyncIterable<GenerateEvent> {
    yield { type: 'queued' }

    let creds: { SecretId?: string; SecretKey?: string }
    try {
      creds = JSON.parse(apiKey) as { SecretId?: string; SecretKey?: string }
    } catch {
      yield { type: 'error', code: 'BAD_CREDS', message: 'Expected JSON {SecretId, SecretKey}', retryable: false }
      return
    }

    if (!creds.SecretId || !creds.SecretKey) {
      yield { type: 'error', code: 'MISSING_CREDS', message: 'SecretId/SecretKey required', retryable: false }
      return
    }

    const region = (input.providerOverrides?.region as string) ?? 'ap-guangzhou'
    const host = 'hunyuan.tencentcloudapi.com'
    const action = 'TextToImageLite'
    const version = '2023-09-01'

    const resolution = hunyuanResolveNative(input.size)

    const body = JSON.stringify({
      Prompt: input.prompt,
      Resolution: resolution,
      Num: input.n ?? 1,
      ...(input.seed != null && { Seed: input.seed }),
      RspImgType: 'url',
    })

    const timestamp = Math.floor(Date.now() / 1000)
    const headers = signTC3({
      secretId: creds.SecretId,
      secretKey: creds.SecretKey,
      host,
      service: 'hunyuan',
      action,
      version,
      region,
      payload: body,
      timestamp,
    })

    try {
      const res = await fetch(`https://${host}/`, { method: 'POST', headers, body, signal })
      if (!res.ok) {
        const code =
          res.status === 401 || res.status === 403
            ? 'UNAUTHORIZED'
            : res.status === 429
              ? 'RATE_LIMIT'
              : `HTTP_${res.status}`
        const retryable = res.status === 429 || res.status >= 500
        yield { type: 'error', code, message: `HTTP ${res.status}`, retryable }
        return
      }

      const data = (await res.json()) as {
        Response?: {
          Error?: { Code?: string; Message?: string }
          ResultImage?: string
          RequestId?: string
        }
      }

      const err = data?.Response?.Error
      if (err) {
        const retryable = /RequestLimitExceeded|InternalError/i.test(err.Code ?? '')
        yield {
          type: 'error',
          code: err.Code ?? 'API_ERROR',
          message: err.Message ?? 'api error',
          retryable,
        }
        return
      }

      const url = data?.Response?.ResultImage
      if (!url) {
        yield { type: 'error', code: 'NO_IMAGE', message: 'no image returned', retryable: false }
        return
      }

      yield { type: 'image', url, index: 0 }
      yield { type: 'done' }
    } catch (e) {
      const err = e as Error
      if (err.name === 'AbortError') {
        yield { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
        return
      }
      yield { type: 'error', code: 'NETWORK', message: err.message, retryable: true }
    }
  },
}
