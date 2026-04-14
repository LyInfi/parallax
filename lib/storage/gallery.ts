import Dexie, { type EntityTable } from 'dexie'

export type Asset = {
  id: string
  sessionId: string
  providerId: string
  blob: Blob
  thumbBlob: Blob
  meta: {
    prompt: string
    params: Record<string, unknown>
    createdAt: number
    favorited: boolean
    parentAssetId?: string
  }
}

class GalleryDb extends Dexie {
  assets!: EntityTable<Asset, 'id'>
  constructor() {
    super('gallery')
    this.version(1).stores({
      assets: 'id, sessionId, providerId, meta.createdAt, meta.parentAssetId, meta.favorited',
    })
  }
}

export const galleryDb = new GalleryDb()

export async function putAsset(a: Asset) { await galleryDb.assets.put(a) }
export async function getAsset(id: string) { return galleryDb.assets.get(id) }
export async function listAssets() {
  return galleryDb.assets.orderBy('meta.createdAt').reverse().toArray()
}
export async function setFavorite(id: string, favorited: boolean) {
  const a = await galleryDb.assets.get(id); if (!a) return
  a.meta.favorited = favorited
  await galleryDb.assets.put(a)
}
export async function childrenOf(parentAssetId: string) {
  return galleryDb.assets.where('meta.parentAssetId').equals(parentAssetId).toArray()
}
