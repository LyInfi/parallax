'use client'
import { useEffect, useState } from 'react'
import { listAssets, type Asset } from '@/lib/storage/gallery'

export function SessionTimeline() {
  const [items, setItems] = useState<Asset[]>([])
  useEffect(() => { listAssets().then(setItems) }, [])

  const byParent = new Map<string | undefined, Asset[]>()
  items.forEach(a => {
    const k = a.meta.parentAssetId
    byParent.set(k, [...(byParent.get(k) ?? []), a])
  })

  const renderNode = (a: Asset): React.ReactElement => (
    <li key={a.id} className="ml-4 border-l pl-3">
      <div className="text-sm">{a.providerId} — {a.meta.prompt.slice(0, 40)}</div>
      <ul>{(byParent.get(a.id) ?? []).map(renderNode)}</ul>
    </li>
  )

  const roots = byParent.get(undefined) ?? []
  if (roots.length === 0) return null
  return <ul className="space-y-2">{roots.map(renderNode)}</ul>
}
