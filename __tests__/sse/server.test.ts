import { describe, it, expect } from 'vitest'
import { sseResponse } from '@/lib/sse/server'

async function* events() {
  yield { type: 'queued' as const }
  yield { type: 'done' as const }
}

describe('sseResponse', () => {
  it('streams each event as data line', async () => {
    const res = sseResponse(events(), new AbortController().signal)
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const text = await res.text()
    expect(text).toContain('data: {"type":"queued"}')
    expect(text).toContain('data: {"type":"done"}')
    expect(text.split('\n\n').length).toBeGreaterThanOrEqual(2)
  })
})
