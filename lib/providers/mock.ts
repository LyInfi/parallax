import type { ProviderAdapter, GenerateEvent, SizeSpec } from './types'
import { dimensionsFor } from './aspect'

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return }
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg=='

export function mockResolveNative(spec: SizeSpec | undefined): string {
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)[x*:×](\d+)$/i)
    if (m) return `${m[1]}x${m[2]}`
    return '1024x1024'
  }
  const s = spec ?? { aspect: '1:1' as const, tier: 'hd' as const }
  const { w, h } = dimensionsFor(s.aspect, s.tier)
  return `${w}x${h}`
}

export const mockProvider: ProviderAdapter = {
  id: 'mock',
  displayName: 'Mock (Dev)',
  capabilities: { textToImage: true, imageToImage: true, maxImages: 4, sizes: ['512x512', '1024x1024'] },
  async *generate(_input, _apiKey, signal): AsyncIterable<GenerateEvent> {
    try {
      yield { type: 'queued' }
      await sleep(100, signal)
      yield { type: 'progress', pct: 50, message: 'rendering' }
      await sleep(100, signal)
      yield { type: 'image', url: PIXEL, index: 0 }
      yield { type: 'done' }
    } catch {
      yield { type: 'error', code: 'ABORTED', message: 'cancelled', retryable: false }
    }
  },
}
