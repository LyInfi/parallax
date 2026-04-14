import { describe, it, expect, beforeEach } from 'vitest'
import { registerProvider, getProvider, listProviders, clearRegistry } from '@/lib/providers/registry'
import type { ProviderAdapter } from '@/lib/providers/types'

const fake: ProviderAdapter = {
  id: 'fake',
  displayName: 'Fake',
  capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] },
  async *generate() { yield { type: 'done' } as const },
}

describe('registry', () => {
  beforeEach(() => clearRegistry())
  it('registers and retrieves', () => {
    registerProvider(fake); expect(getProvider('fake')).toBe(fake)
  })
  it('lists all', () => {
    registerProvider(fake); expect(listProviders().map(p => p.id)).toEqual(['fake'])
  })
  it('throws for unknown id', () => {
    expect(() => getProvider('nope')).toThrow(/unknown provider/i)
  })
  it('rejects duplicate id', () => {
    registerProvider(fake); expect(() => registerProvider(fake)).toThrow(/already registered/i)
  })
})
