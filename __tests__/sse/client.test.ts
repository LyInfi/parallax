import { describe, it, expect, vi } from 'vitest'
import { streamSSE } from '@/lib/sse/client'

function mockFetchSSE(chunks: string[]): typeof fetch {
  return vi.fn(async () => {
    const enc = new TextEncoder()
    const stream = new ReadableStream({
      start(c) { chunks.forEach(x => c.enqueue(enc.encode(x))); c.close() },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }) as any
}

describe('streamSSE', () => {
  it('parses multiple events across chunk boundaries', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = mockFetchSSE([
      'data: {"type":"queued"}\n\ndata: {"type":"prog',
      'ress","pct":50}\n\ndata: {"type":"done"}\n\n',
    ])
    const got: string[] = []
    for await (const evt of streamSSE('/api/generate', { method: 'POST' })) {
      got.push(evt.type)
    }
    globalThis.fetch = orig
    expect(got).toEqual(['queued', 'progress', 'done'])
  })
})
