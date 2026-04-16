export type Aspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
export type Tier = 'standard' | 'hd' | 'ultra'

export const ASPECTS: { id: Aspect }[] = [
  { id: '1:1' },
  { id: '16:9' },
  { id: '9:16' },
  { id: '4:3' },
  { id: '3:4' },
]

export const TIERS: { id: Tier }[] = [
  { id: 'standard' },
  { id: 'hd' },
  { id: 'ultra' },
]

// Reference dimensions per (aspect, tier) — used for UI preview and as default fallback
// for providers with free-form WxH. Long side = base[tier], short side snapped to 8px grid.
export function dimensionsFor(aspect: Aspect, tier: Tier): { w: number; h: number } {
  const base: Record<Tier, number> = { standard: 1024, hd: 2048, ultra: 4096 }
  const longSide = base[tier]
  const [a, b] = aspect.split(':').map(Number)
  if (a === b) return { w: longSide, h: longSide }
  if (a > b) return { w: longSide, h: Math.round(longSide * b / a / 8) * 8 }
  return { w: Math.round(longSide * a / b / 8) * 8, h: longSide }
}

export function formatWxH(aspect: Aspect, tier: Tier): string {
  const { w, h } = dimensionsFor(aspect, tier)
  return `${w}x${h}`
}

export function inferAspect(w: number, h: number): Aspect {
  const r = w / h
  if (Math.abs(r - 1) < 0.05) return '1:1'
  if (Math.abs(r - 16 / 9) < 0.1) return '16:9'
  if (Math.abs(r - 9 / 16) < 0.1) return '9:16'
  if (Math.abs(r - 4 / 3) < 0.1) return '4:3'
  if (Math.abs(r - 3 / 4) < 0.1) return '3:4'
  return r > 1 ? '16:9' : r < 1 ? '9:16' : '1:1'
}

export function inferTier(w: number, h: number): Tier {
  const long = Math.max(w, h)
  if (long >= 3072) return 'ultra'
  if (long >= 1536) return 'hd'
  return 'standard'
}
