export type SizePreset = {
  id: string
  label: string
  width: number
  height: number
  ratio: string
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: '1024x1024', label: '1024×1024 · 正方形', width: 1024, height: 1024, ratio: '1:1' },
  { id: '512x512',   label: '512×512 · 正方形（小）', width: 512, height: 512, ratio: '1:1' },
  { id: '768x1024',  label: '768×1024 · 竖图', width: 768, height: 1024, ratio: '3:4' },
  { id: '1024x768',  label: '1024×768 · 横图', width: 1024, height: 768, ratio: '4:3' },
  { id: '720x1280',  label: '720×1280 · 竖屏', width: 720, height: 1280, ratio: '9:16' },
  { id: '1280x720',  label: '1280×720 · 横屏', width: 1280, height: 720, ratio: '16:9' },
  { id: '1024x1792', label: '1024×1792 · 竖图（高）', width: 1024, height: 1792, ratio: '9:16' },
  { id: '1792x1024', label: '1792×1024 · 横图（宽）', width: 1792, height: 1024, ratio: '16:9' },
]

export function parseSize(s: string): { w: number; h: number } | null {
  const upper = s.toUpperCase()
  if (upper === '1K') return { w: 1024, h: 1024 }
  if (upper === '2K') return { w: 2048, h: 2048 }
  if (upper === '4K') return { w: 4096, h: 4096 }
  const m = s.match(/^(\d+)\s*[x*:×]\s*(\d+)$/i)
  if (!m) return null
  return { w: Number(m[1]), h: Number(m[2]) }
}

export function resolveSize(desired: string, supported: string[]): string {
  if (supported.includes(desired)) return desired
  const d = parseSize(desired)
  if (!d) return supported[0]
  const dRatio = d.w / d.h
  const dArea = d.w * d.h
  let best = supported[0]
  let bestScore = Infinity
  for (const s of supported) {
    const p = parseSize(s)
    if (!p) continue
    const ratioDiff = Math.abs(p.w / p.h - dRatio) / dRatio
    const areaDiff = Math.abs(p.w * p.h - dArea) / dArea
    const score = ratioDiff * 2 + areaDiff
    if (score < bestScore) { bestScore = score; best = s }
  }
  return best
}
