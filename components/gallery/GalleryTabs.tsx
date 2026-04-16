'use client'
import { useState, useEffect } from 'react'
import {
  listAssets, listFavoriteAssets, listSessions, assetsOfSession, setFavorite,
  deleteAsset, deleteSession,
  type Asset, type GallerySession,
} from '@/lib/storage/gallery'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

function Lightbox({
  asset, url, open, onOpenChange, onToggleFav, onDownload, onDelete,
}: {
  asset: Asset | null
  url: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onToggleFav: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const t = useT()
  if (!asset || !url) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-[90vw] max-h-[90vh] flex flex-col gap-2 p-3">
        <DialogTitle className="sr-only">{t('gallery.lightbox.sr')}</DialogTitle>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted rounded">
          <img src={url} alt={asset.meta.prompt} className="max-w-full max-h-[75vh] object-contain" />
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{asset.meta.prompt || t('gallery.noPrompt')}</div>
            <div className="text-xs text-muted-foreground">
              {asset.providerId}
              {asset.meta.model && <> · <span className="font-mono">{asset.meta.model}</span></>}
              {' · '}
              {new Date(asset.meta.createdAt).toLocaleString()}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onToggleFav}>
            {asset.meta.favorited ? t('gallery.favorited') : t('gallery.unfavorited')}
          </Button>
          <Button size="sm" variant="outline" onClick={onDownload}>{t('gallery.download')}</Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            title={t('gallery.delete.image.title')}
            description={t('gallery.delete.image.desc')}
            confirmLabel={t('gallery.delete')}
            onConfirm={onDelete}
          >
            {t('gallery.delete')}
          </ConfirmButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AssetCard({
  a, urls, onOpen, onToggleFav, onDelete,
}: {
  a: Asset
  urls: Record<string, string>
  onOpen: () => void
  onToggleFav: () => void
  onDelete: () => void
}) {
  const t = useT()
  return (
    <div className="border rounded p-2 space-y-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('gallery.previewAria', { prompt: a.meta.prompt })}
        className="block w-full cursor-zoom-in"
      >
        <img src={urls[a.id]} alt={a.meta.prompt} className="w-full rounded hover:opacity-90 transition" />
      </button>
      <div className="text-xs truncate">{a.meta.prompt}</div>
      <div className="text-xs text-muted-foreground truncate" title={a.meta.model ?? a.providerId}>
        {a.providerId}
        {a.meta.model && <> · <span className="font-mono">{a.meta.model}</span></>}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={onToggleFav}>
          {a.meta.favorited ? t('gallery.favorited') : t('gallery.unfavorited')}
        </Button>
        <ConfirmButton
          size="sm"
          variant="destructive"
          title={t('gallery.delete.image.title')}
          description={t('gallery.delete.image.desc')}
          confirmLabel={t('gallery.delete')}
          onConfirm={onDelete}
        >
          {t('gallery.delete')}
        </ConfirmButton>
      </div>
    </div>
  )
}

function downloadAsset(asset: Asset) {
  const url = URL.createObjectURL(asset.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${asset.providerId}-${asset.id}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function AssetsView({ favoritesOnly }: { favoritesOnly: boolean }) {
  const [items, setItems] = useState<Asset[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const t = useT()

  const reload = async () => {
    const list = favoritesOnly ? await listFavoriteAssets() : await listAssets()
    setItems(list)
    const map: Record<string, string> = {}
    list.forEach(a => { map[a.id] = URL.createObjectURL(a.thumbBlob) })
    setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return map })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [favoritesOnly])

  const openAsset = items.find(a => a.id === openId) ?? null

  if (items.length === 0) return <p className="text-muted-foreground">{favoritesOnly ? t('gallery.empty.favorites') : t('gallery.empty.assets')}</p>
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {items.map(a => (
          <AssetCard
            key={a.id}
            a={a}
            urls={urls}
            onOpen={() => setOpenId(a.id)}
            onToggleFav={async () => { await setFavorite(a.id, !a.meta.favorited); reload() }}
            onDelete={async () => { await deleteAsset(a.id); reload() }}
          />
        ))}
      </div>
      <Lightbox
        asset={openAsset}
        url={openAsset ? urls[openAsset.id] : null}
        open={openId !== null}
        onOpenChange={(v) => { if (!v) setOpenId(null) }}
        onToggleFav={async () => {
          if (!openAsset) return
          await setFavorite(openAsset.id, !openAsset.meta.favorited)
          reload()
        }}
        onDownload={() => openAsset && downloadAsset(openAsset)}
        onDelete={async () => {
          if (!openAsset) return
          await deleteAsset(openAsset.id)
          setOpenId(null)
          reload()
        }}
      />
    </>
  )
}

function SessionsView() {
  const [sessions, setSessions] = useState<GallerySession[]>([])
  const [sessionAssets, setSessionAssets] = useState<Record<string, Asset[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  const load = async () => {
    const ss = await listSessions()
    setSessions(ss)
    const map: Record<string, Asset[]> = {}
    const urlMap: Record<string, string> = {}
    for (const s of ss) {
      const as = await assetsOfSession(s.id)
      map[s.id] = as
      for (const a of as) urlMap[a.id] = URL.createObjectURL(a.thumbBlob)
    }
    setSessionAssets(map)
    setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return urlMap })
  }

  useEffect(() => { load() }, [])

  const reloadPrompt = (s: GallerySession) => {
    usePromptStore.getState().setPrompt(s.prompt)
    usePromptStore.getState().setParams({
      size: s.params.size as string | undefined,
      n: s.params.n as number | undefined,
      seed: s.params.seed as number | undefined,
    })
    router.push('/')
  }

  const allAssets = Object.values(sessionAssets).flat()
  const openAsset = allAssets.find(a => a.id === openId) ?? null

  if (sessions.length === 0) return <p className="text-muted-foreground">{t('gallery.empty.sessions')}</p>
  return (
    <>
      <div className="space-y-4">
        {sessions.map(s => (
          <div key={s.id} className="border rounded p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium break-words line-clamp-2" title={s.prompt}>
                  {s.prompt || t('gallery.noPrompt')}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                  {new Date(s.createdAt).toLocaleString()}
                  {' · '}
                  {s.providerIds.map((pid, i) => {
                    const m = s.models?.[pid]
                    return (
                      <span key={pid}>
                        {i > 0 && ', '}
                        {pid}
                        {m && <span className="font-mono"> ({m})</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => reloadPrompt(s)}>
                  {t('gallery.reloadPrompt')}
                </Button>
                <ConfirmButton
                  size="sm"
                  variant="destructive"
                  title={t('gallery.delete.session.title')}
                  description={t('gallery.delete.session.desc')}
                  confirmLabel={t('gallery.delete')}
                  onConfirm={async () => {
                    await deleteSession(s.id)
                    load()
                  }}
                >
                  {t('gallery.delete')}
                </ConfirmButton>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(sessionAssets[s.id] ?? []).map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setOpenId(a.id)}
                  aria-label={t('gallery.previewAria', { prompt: a.meta.prompt })}
                  className="cursor-zoom-in"
                >
                  <img src={urls[a.id]} alt={s.prompt} className="h-24 rounded object-cover hover:opacity-90 transition" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Lightbox
        asset={openAsset}
        url={openAsset ? urls[openAsset.id] : null}
        open={openId !== null}
        onOpenChange={(v) => { if (!v) setOpenId(null) }}
        onToggleFav={async () => {
          if (!openAsset) return
          await setFavorite(openAsset.id, !openAsset.meta.favorited)
          load()
        }}
        onDownload={() => openAsset && downloadAsset(openAsset)}
        onDelete={async () => {
          if (!openAsset) return
          await deleteAsset(openAsset.id)
          setOpenId(null)
          load()
        }}
      />
    </>
  )
}

export function GalleryTabs() {
  const [tab, setTab] = useState<'all' | 'fav' | 'sessions'>('all')
  const t = useT()
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm ${tab === 'all' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('all')}
        >
          {t('gallery.tab.all')}
        </button>
        <button
          className={`px-3 py-2 text-sm ${tab === 'fav' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('fav')}
        >
          {t('gallery.tab.fav')}
        </button>
        <button
          className={`px-3 py-2 text-sm ${tab === 'sessions' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('sessions')}
        >
          {t('gallery.tab.sessions')}
        </button>
      </div>
      {tab === 'all' && <AssetsView favoritesOnly={false} />}
      {tab === 'fav' && <AssetsView favoritesOnly={true} />}
      {tab === 'sessions' && <SessionsView />}
    </div>
  )
}
