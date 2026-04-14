import { describe, it, expect, beforeEach } from 'vitest'
import { setKey, getKey, deleteKey, listKeyedProviders } from '@/lib/storage/keys'

describe('keys storage', () => {
  beforeEach(() => localStorage.clear())
  it('stores and retrieves', () => {
    setKey('mock', 'abc'); expect(getKey('mock')).toBe('abc')
  })
  it('deletes', () => {
    setKey('mock', 'abc'); deleteKey('mock'); expect(getKey('mock')).toBeNull()
  })
  it('lists providers with keys', () => {
    setKey('a', '1'); setKey('b', '2')
    expect(listKeyedProviders().sort()).toEqual(['a', 'b'])
  })
})
