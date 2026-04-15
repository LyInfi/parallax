'use client'
import { useEffect, useState } from 'react'
import { listAssets, setFavorite, type Asset } from '@/lib/storage/gallery'
import { Button } from '@/components/ui/button'

export function GalleryGrid() {
  const [items, setItems] = useState<Asset[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  const reload = async () => {
    const list = await listAssets()
    setItems(list)
    const map: Record<string, string> = {}
    list.forEach(a => { map[a.id] = URL.createObjectURL(a.thumbBlob) })
    setUrls(prev => {
      Object.values(prev).forEach(URL.revokeObjectURL)
      return map
    })
  }
  useEffect(() => {
    reload()
    return () => { /* cleanup handled on next reload */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (items.length === 0) return <p className="text-muted-foreground">暂无保存的图片</p>

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {items.map(a => (
        <div key={a.id} className="border rounded p-2 space-y-1">
          <img src={urls[a.id]} alt={a.meta.prompt} className="w-full rounded" />
          <div className="text-xs truncate">{a.meta.prompt}</div>
          <div className="text-xs text-muted-foreground">{a.providerId}</div>
          <Button size="sm" variant="outline" onClick={async () => { await setFavorite(a.id, !a.meta.favorited); reload() }}>
            {a.meta.favorited ? '取消收藏' : '收藏'}
          </Button>
        </div>
      ))}
    </div>
  )
}
