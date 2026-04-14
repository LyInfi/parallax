import { describe, it, expect, beforeAll } from 'vitest'
import { POST } from '@/app/api/generate/route'
import { bootstrapProviders } from '@/lib/providers'

beforeAll(() => bootstrapProviders())

function makeReq(body: unknown, apiKey = 'k'): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  })
}

describe('POST /api/generate', () => {
  it('returns SSE stream for mock provider', async () => {
    const res = await POST(makeReq({ providerId: 'mock', input: { prompt: 'hi' } }))
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const text = await res.text()
    expect(text).toContain('"type":"queued"')
    expect(text).toContain('"type":"done"')
  })
  it('400 on invalid body', async () => {
    const res = await POST(makeReq({ providerId: 'mock' } as any))
    expect(res.status).toBe(400)
  })
  it('400 on unknown provider', async () => {
    const res = await POST(makeReq({ providerId: 'nope', input: { prompt: 'x' } }))
    expect(res.status).toBe(400)
  })
  it('401 when api key missing', async () => {
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'mock', input: { prompt: 'x' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
