import { describe, it, expect } from 'vitest'
import { parseSize, resolveSize, SIZE_PRESETS } from '@/lib/providers/size-catalog'

describe('size-catalog', () => {
  it('parses standard formats', () => {
    expect(parseSize('1024x1024')).toEqual({ w: 1024, h: 1024 })
    expect(parseSize('1024*1024')).toEqual({ w: 1024, h: 1024 })
    expect(parseSize('1024:1024')).toEqual({ w: 1024, h: 1024 })
    expect(parseSize('1K')).toEqual({ w: 1024, h: 1024 })
    expect(parseSize('4K')).toEqual({ w: 4096, h: 4096 })
    expect(parseSize('garbage')).toBeNull()
  })

  it('returns exact match when supported', () => {
    expect(resolveSize('1024x1024', ['512x512', '1024x1024'])).toBe('1024x1024')
  })

  it('maps to closest aspect ratio when not supported', () => {
    // 720x1280 (9:16) → prefer 1024x1792 (9:16) over 1024x768 (4:3)
    expect(resolveSize('720x1280', ['1024x1024', '1024x768', '1024x1792'])).toBe('1024x1792')
  })

  it('maps to 1K for wanxiang when given 1024x1024', () => {
    expect(resolveSize('1024x1024', ['1K', '2K', '4K'])).toBe('1K')
  })

  it('includes canonical presets', () => {
    expect(SIZE_PRESETS.length).toBeGreaterThan(4)
    expect(SIZE_PRESETS[0].id).toBe('1024x1024')
  })
})
