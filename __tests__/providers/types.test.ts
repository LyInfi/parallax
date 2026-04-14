import { describe, it, expect } from 'vitest'
import { isGenerateEvent, GenerateEventSchema } from '@/lib/providers/types'

describe('GenerateEvent', () => {
  it('accepts queued event', () => {
    expect(isGenerateEvent({ type: 'queued' })).toBe(true)
  })
  it('accepts image event with url and index', () => {
    expect(isGenerateEvent({ type: 'image', url: 'data:x', index: 0 })).toBe(true)
  })
  it('rejects malformed event', () => {
    expect(isGenerateEvent({ type: 'bogus' } as any)).toBe(false)
  })
  it('schema parses error event with retryable', () => {
    const r = GenerateEventSchema.safeParse({ type: 'error', code: 'RATE_LIMIT', message: 'x', retryable: true })
    expect(r.success).toBe(true)
  })
})
