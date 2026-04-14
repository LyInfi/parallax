import type { GenerateEvent } from '@/lib/providers/types'

export function sseResponse(source: AsyncIterable<GenerateEvent>, signal: AbortSignal): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const abort = () => { try { controller.close() } catch {} }
      signal.addEventListener('abort', abort, { once: true })
      try {
        for await (const evt of source) {
          if (signal.aborted) break
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', code: 'STREAM', message: msg, retryable: false })}\n\n`))
      } finally {
        signal.removeEventListener('abort', abort)
        try { controller.close() } catch {}
      }
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
