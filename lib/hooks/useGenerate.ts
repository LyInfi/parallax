'use client'
import { useRef, useState } from 'react'
import { streamSSE } from '@/lib/sse/client'
import type { SizeSpec } from '@/lib/providers/types'
import { getCreds, setCreds } from '@/lib/storage/keys'

/**
 * Notify the user that a generation finished while the window was hidden /
 * minimized / in the background. No-op when the window is focused (the user
 * can already see the result), or when the runtime is not a browser.
 */
function notifyIfHidden(message: string) {
  if (typeof document === 'undefined' || typeof Notification === 'undefined') return
  if (!document.hidden) return
  const fire = () => new Notification('Parallax', { body: message })
  if (Notification.permission === 'granted') fire()
  else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => { if (p === 'granted') fire() }).catch(() => {})
  }
}

type Status = 'idle' | 'queued' | 'running' | 'done' | 'error'

export type StartParams = {
  providerId: string
  apiKey: string
  input: { prompt: string; referenceImages?: Blob[]; size?: SizeSpec; n?: number; seed?: number }
}

async function blobToBase64(b: Blob): Promise<string> {
  return await new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })
}

export function useGenerate() {
  const [status, setStatus] = useState<Status>('idle')
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const acRef = useRef<AbortController | null>(null)

  const start = async (p: StartParams) => {
    setStatus('queued'); setImages([]); setError(null); setPct(null)
    const ac = new AbortController(); acRef.current = ac
    const referenceImages = p.input.referenceImages
      ? await Promise.all(p.input.referenceImages.map(blobToBase64))
      : undefined
    try {
      for await (const evt of streamSSE('/api/generate', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': p.apiKey },
        body: JSON.stringify({
          providerId: p.providerId,
          input: { ...p.input, referenceImages },
        }),
      })) {
        if (evt.type === 'queued') setStatus('queued')
        else if (evt.type === 'progress') { setStatus('running'); if (evt.pct != null) setPct(evt.pct) }
        else if (evt.type === 'image') { setStatus('running'); setImages(prev => [...prev, evt.url]) }
        else if (evt.type === 'credential-refresh') {
          const existing = getCreds(p.providerId) ?? {}
          setCreds(p.providerId, { ...existing, ...evt.fields })
        }
        else if (evt.type === 'error') {
          setError({ code: evt.code, message: evt.message })
          setStatus('error')
          notifyIfHidden(`Generation failed: ${evt.message}`)
          return
        }
        else if (evt.type === 'done') {
          setStatus('done')
          notifyIfHidden('Generation complete')
          return
        }
      }
      setStatus('done')
      notifyIfHidden('Generation complete')
    } catch (e) {
      setError({ code: 'NETWORK', message: (e as Error).message })
      setStatus('error')
      notifyIfHidden(`Network error: ${(e as Error).message}`)
    }
  }

  const cancel = () => { acRef.current?.abort() }

  return { status, images, error, pct, start, cancel }
}
