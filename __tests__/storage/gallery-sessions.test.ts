import { describe, it, expect, beforeEach } from 'vitest'
import {
  putAsset, putSession, listSessions, assetsOfSession, listFavoriteAssets,
  galleryDb,
} from '@/lib/storage/gallery'

async function blob(text: string) { return new Blob([text]) }

describe('gallery sessions', () => {
  beforeEach(async () => {
    await galleryDb.assets.clear()
    await galleryDb.sessions.clear()
  })

  it('putSession / listSessions returns sessions newest-first', async () => {
    await putSession({ id: 's1', prompt: 'first', params: {}, providerIds: ['mock'], createdAt: 1000 })
    await putSession({ id: 's2', prompt: 'second', params: {}, providerIds: ['mock'], createdAt: 2000 })
    const all = await listSessions()
    expect(all.map(s => s.id)).toEqual(['s2', 's1'])
  })

  it('assetsOfSession returns only assets for that session', async () => {
    await putAsset({
      id: 'a1', sessionId: 's1', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    await putAsset({
      id: 'a2', sessionId: 's2', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 2, favorited: false },
    })
    const s1assets = await assetsOfSession('s1')
    expect(s1assets.map(a => a.id)).toEqual(['a1'])
  })

  it('listFavoriteAssets returns only favorited assets', async () => {
    await putAsset({
      id: 'fav', sessionId: 's1', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: true },
    })
    await putAsset({
      id: 'notfav', sessionId: 's1', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 2, favorited: false },
    })
    const favs = await listFavoriteAssets()
    expect(favs.map(a => a.id)).toEqual(['fav'])
  })

  it('session stores parentAssetId for derivation', async () => {
    await putSession({
      id: 's3', prompt: 'derived', params: { size: '512x512' }, providerIds: ['mock'],
      createdAt: 3000, parentAssetId: 'parent-asset',
    })
    const all = await listSessions()
    expect(all[0].parentAssetId).toBe('parent-asset')
  })
})
