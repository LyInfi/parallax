import { GenerateEventSchema, type GenerateEvent } from '@/lib/providers/types'

export async function* streamSSE(url: string, init: RequestInit = {}): AsyncGenerator<GenerateEvent> {
  const res = await fetch(url, init)
  if (!res.ok || !res.body) {
    yield { type: 'error', code: `HTTP_${res.status}`, message: res.statusText || 'request failed', retryable: res.status >= 500 }
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = frame.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      const json = line.slice(6).trim()
      if (!json) continue
      try {
        yield GenerateEventSchema.parse(JSON.parse(json))
      } catch { /* ignore malformed */ }
    }
  }
}
