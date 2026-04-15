'use client'
import { useState, useEffect } from 'react'
import {
  listAssets, listFavoriteAssets, listSessions, assetsOfSession, setFavorite,
  type Asset, type GallerySession,
} from '@/lib/storage/gallery'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

function AssetCard({ a, urls, onToggleFav }: { a: Asset; urls: Record<string, string>; onToggleFav: () => void }) {
  return (
    <div className="border rounded p-2 space-y-1">
      <img src={urls[a.id]} alt={a.meta.prompt} className="w-full rounded" />
      <div className="text-xs truncate">{a.meta.prompt}</div>
      <div className="text-xs text-muted-foreground">{a.providerId}</div>
      <Button size="sm" variant="outline" onClick={onToggleFav}>
        {a.meta.favorited ? '取消收藏' : '收藏'}
      </Button>
    </div>
  )
}

function AssetsView({ favoritesOnly }: { favoritesOnly: boolean }) {
  const [items, setItems] = useState<Asset[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  const reload = async () => {
    const list = favoritesOnly ? await listFavoriteAssets() : await listAssets()
    setItems(list)
    const map: Record<string, string> = {}
    list.forEach(a => { map[a.id] = URL.createObjectURL(a.thumbBlob) })
    setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return map })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [favoritesOnly])

  if (items.length === 0) return <p className="text-muted-foreground">暂无图片</p>
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {items.map(a => (
        <AssetCard
          key={a.id}
          a={a}
          urls={urls}
          onToggleFav={async () => { await setFavorite(a.id, !a.meta.favorited); reload() }}
        />
      ))}
    </div>
  )
}

function SessionsView() {
  const [sessions, setSessions] = useState<GallerySession[]>([])
  const [sessionAssets, setSessionAssets] = useState<Record<string, Asset[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
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
    })()
  }, [])

  const reloadPrompt = (s: GallerySession) => {
    usePromptStore.getState().setPrompt(s.prompt)
    usePromptStore.getState().setParams({
      size: s.params.size as string | undefined,
      n: s.params.n as number | undefined,
      seed: s.params.seed as number | undefined,
    })
    router.push('/')
  }

  if (sessions.length === 0) return <p className="text-muted-foreground">暂无生成记录</p>
  return (
    <div className="space-y-4">
      {sessions.map(s => (
        <div key={s.id} className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium truncate">{s.prompt || '(无提示词)'}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()} · {s.providerIds.join(', ')}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => reloadPrompt(s)}>重新载入提示词</Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(sessionAssets[s.id] ?? []).map(a => (
              <img key={a.id} src={urls[a.id]} alt={s.prompt} className="h-24 rounded object-cover" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function GalleryTabs() {
  const [tab, setTab] = useState<'all' | 'fav' | 'sessions'>('all')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm ${tab === 'all' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('all')}
        >
          全部
        </button>
        <button
          className={`px-3 py-2 text-sm ${tab === 'fav' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('fav')}
        >
          收藏
        </button>
        <button
          className={`px-3 py-2 text-sm ${tab === 'sessions' ? 'border-b-2 border-foreground font-medium' : 'text-muted-foreground'}`}
          onClick={() => setTab('sessions')}
        >
          会话
        </button>
      </div>
      {tab === 'all' && <AssetsView favoritesOnly={false} />}
      {tab === 'fav' && <AssetsView favoritesOnly={true} />}
      {tab === 'sessions' && <SessionsView />}
    </div>
  )
}
