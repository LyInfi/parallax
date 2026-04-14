import { describe, it, expect, beforeEach } from 'vitest'
import { putAsset, listAssets, getAsset, setFavorite, childrenOf, galleryDb } from '@/lib/storage/gallery'

async function blob(text: string) { return new Blob([text]) }

describe('gallery', () => {
  beforeEach(async () => { await galleryDb.assets.clear() })

  it('puts and lists', async () => {
    await putAsset({
      id: 'a1', sessionId: 's1', providerId: 'mock',
      blob: await blob('full'), thumbBlob: await blob('thumb'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    const all = await listAssets()
    expect(all).toHaveLength(1)
    expect((await getAsset('a1'))?.id).toBe('a1')
  })

  it('toggles favorite', async () => {
    await putAsset({
      id: 'a2', sessionId: 's', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    await setFavorite('a2', true)
    expect((await getAsset('a2'))?.meta.favorited).toBe(true)
  })

  it('queries children by parentAssetId', async () => {
    await putAsset({
      id: 'p', sessionId: 's', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p', params: {}, createdAt: 1, favorited: false },
    })
    await putAsset({
      id: 'c', sessionId: 's2', providerId: 'mock',
      blob: await blob('x'), thumbBlob: await blob('x'),
      meta: { prompt: 'p2', params: {}, createdAt: 2, favorited: false, parentAssetId: 'p' },
    })
    const kids = await childrenOf('p')
    expect(kids.map(a => a.id)).toEqual(['c'])
  })
})
