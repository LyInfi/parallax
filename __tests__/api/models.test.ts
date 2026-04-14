import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/models/route'

describe('GET /api/models', () => {
  it('returns registered providers with capabilities', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mock', displayName: 'Mock (Dev)' }),
    ]))
    expect(body.providers[0]).toHaveProperty('capabilities')
  })
})
