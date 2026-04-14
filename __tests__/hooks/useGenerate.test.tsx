import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGenerate } from '@/lib/hooks/useGenerate'

vi.mock('@/lib/sse/client', () => ({
  async *streamSSE() {
    yield { type: 'queued' }
    yield { type: 'image', url: 'data:x', index: 0 }
    yield { type: 'done' }
  },
}))

describe('useGenerate', () => {
  it('progresses through states and collects image', async () => {
    const { result } = renderHook(() => useGenerate())
    act(() => { result.current.start({ providerId: 'mock', apiKey: 'k', input: { prompt: 'hi' } }) })
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.images).toEqual(['data:x'])
  })
})
