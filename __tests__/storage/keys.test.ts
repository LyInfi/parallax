import { describe, it, expect, beforeEach } from 'vitest'
import { setKey, getKey, deleteKey, listKeyedProviders, setCreds, getCreds } from '@/lib/storage/keys'

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

describe('setCreds / getCreds', () => {
  beforeEach(() => localStorage.clear())

  it('stores and retrieves multi-field creds', () => {
    setCreds('hunyuan', { SecretId: 'id123', SecretKey: 'key456' })
    expect(getCreds('hunyuan')).toEqual({ SecretId: 'id123', SecretKey: 'key456' })
  })

  it('stores and retrieves single-field creds', () => {
    setCreds('mock', { apiKey: 'mykey' })
    expect(getCreds('mock')).toEqual({ apiKey: 'mykey' })
  })

  it('returns null when nothing stored', () => {
    expect(getCreds('notexist')).toBeNull()
  })

  it('legacy: raw string stored via setKey is returned as { apiKey: string }', () => {
    setKey('legacy', 'rawstring')
    expect(getCreds('legacy')).toEqual({ apiKey: 'rawstring' })
  })
})
