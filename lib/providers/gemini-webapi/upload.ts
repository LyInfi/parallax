// Upload a reference image to content-push.googleapis.com/upload.
// Blob-based (no filesystem) — accepts Buffer/Uint8Array/Blob directly.
// Upstream: HanaokaYuzu/Gemini-API. See NOTICE.md.

import { Endpoint, Headers } from './constants'
import { fetch_with_timeout } from './http'

export type UploadInput = { bytes: Uint8Array; filename: string; mimeType?: string }

export async function upload_file(input: UploadInput, signal?: AbortSignal): Promise<string> {
  const { bytes, filename, mimeType } = input
  const part = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = mimeType ? new Blob([part], { type: mimeType }) : new Blob([part])
  const form = new FormData()
  form.append('file', blob, filename)

  const res = await fetch_with_timeout(Endpoint.UPLOAD, {
    method: 'POST',
    headers: { ...Headers.UPLOAD },
    body: form,
    redirect: 'follow',
    signal,
    timeout_ms: 60_000,
  })

  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  return (await res.text()).trim()
}

export function dataUrlToBytes(dataUrl: string): UploadInput {
  if (!dataUrl.startsWith('data:')) throw new Error('Expected data: URL')
  const commaIdx = dataUrl.indexOf(',')
  const header = dataUrl.slice(5, commaIdx)
  const [mimeType, encoding] = header.split(';')
  if (encoding !== 'base64') throw new Error('Only base64 data URLs are supported')

  const payload = dataUrl.slice(commaIdx + 1)
  const bin = atob(payload)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const ext = mimeTypeToExt(mimeType || 'image/png')
  const filename = `reference-${Date.now()}.${ext}`
  return { bytes, filename, mimeType: mimeType || 'image/png' }
}

function mimeTypeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'bin'
  }
}
