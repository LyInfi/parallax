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
    model?: string
  }
}

export type GallerySession = {
  id: string
  prompt: string
  params: Record<string, unknown>
  providerIds: string[]
  /** Map providerId → effective model id used (optional; may be empty for legacy rows) */
  models?: Record<string, string>
  createdAt: number
  parentAssetId?: string
}

class GalleryDb extends Dexie {
  assets!: EntityTable<Asset, 'id'>
  sessions!: EntityTable<GallerySession, 'id'>
  constructor() {
    super('gallery')
    this.version(1).stores({
      assets: 'id, sessionId, providerId, meta.createdAt, meta.parentAssetId, meta.favorited',
    })
    this.version(2).stores({
      assets: 'id, sessionId, providerId, meta.createdAt, meta.parentAssetId, meta.favorited',
      sessions: 'id, createdAt',
    })
  }
}

export const galleryDb = new GalleryDb()

export async function putAsset(a: Asset) { await galleryDb.assets.put(a) }
export async function getAsset(id: string) { return galleryDb.assets.get(id) }
export async function listAssets() {
  return galleryDb.assets.orderBy('meta.createdAt').reverse().toArray()
}
export async function listFavoriteAssets() {
  const all = await galleryDb.assets.orderBy('meta.createdAt').reverse().toArray()
  return all.filter(a => a.meta.favorited)
}
export async function setFavorite(id: string, favorited: boolean) {
  const a = await galleryDb.assets.get(id); if (!a) return
  a.meta.favorited = favorited
  await galleryDb.assets.put(a)
}
export async function childrenOf(parentAssetId: string) {
  return galleryDb.assets.where('meta.parentAssetId').equals(parentAssetId).toArray()
}

// session helpers
export async function putSession(s: GallerySession) { await galleryDb.sessions.put(s) }
export async function listSessions() {
  return galleryDb.sessions.orderBy('createdAt').reverse().toArray()
}
export async function assetsOfSession(sessionId: string) {
  return galleryDb.assets.where('sessionId').equals(sessionId).toArray()
}
