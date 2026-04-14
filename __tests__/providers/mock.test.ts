import { describe, it, expect } from 'vitest'
import { mockProvider } from '@/lib/providers/mock'

describe('mockProvider', () => {
  it('emits queued → progress → image → done', async () => {
    const events: string[] = []
    const ac = new AbortController()
    for await (const evt of mockProvider.generate({ prompt: 'hello' }, 'key', ac.signal)) {
      events.push(evt.type)
    }
    expect(events).toEqual(['queued', 'progress', 'image', 'done'])
  })
  it('respects abort', async () => {
    const ac = new AbortController()
    const it = mockProvider.generate({ prompt: 'x' }, 'k', ac.signal)[Symbol.asyncIterator]()
    await it.next()
    ac.abort()
    const res = await it.next()
    expect(res.done || res.value?.type === 'error').toBe(true)
  })
})
