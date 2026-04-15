'use client'
import { useEffect, useState } from 'react'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { useModelStore } from '@/lib/store/useModelStore'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AttachmentTrigger, AttachmentThumbs } from './AttachmentUploader'
import { ASPECTS, TIERS } from '@/lib/providers/aspect'
import type { Aspect, Tier } from '@/lib/providers/aspect'
import { previewSize } from '@/lib/providers/size-preview'
import type { SizeSpec } from '@/lib/providers/types'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'

bootstrapProviders()

type Props = { onGenerate: () => void; busy?: boolean; onCancel?: () => void }

export function PromptBar({ onGenerate, busy, onCancel }: Props) {
  const { prompt, setPrompt, params, setParams } = usePromptStore()
  const cards = useModelStore((s) => s.cards)
  const [providers, setProviders] = useState<Array<{ id: string; displayName: string }>>([])
  useEffect(() => { setProviders(listProviders()) }, [])

  const disabled = !prompt.trim() || !!busy

  const selectedAspect: Aspect = params.aspect ?? '1:1'
  const selectedTier: Tier = params.tier ?? 'hd'
  const sizeSpec: SizeSpec = { aspect: selectedAspect, tier: selectedTier }

  const providerById = new Map(providers.map(p => [p.id, p]))
  const activeProviderIds = Array.from(new Set(cards.map(c => c.providerId)))
  const previews = activeProviderIds
    .map(id => {
      const p = providerById.get(id)
      if (!p) return null
      return { name: p.displayName, size: previewSize(id, sizeSpec) }
    })
    .filter(Boolean) as Array<{ name: string; size: string }>

  return (
    <div className="border-t p-3 space-y-2 bg-background">
      <AttachmentThumbs />
      <div className="flex gap-2 items-start">
        <AttachmentTrigger />
        <Textarea
          placeholder="描述你想生成的内容…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="flex-1"
        />
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">宽高比</label>
        <select
          aria-label="aspect"
          value={selectedAspect}
          onChange={(e) => setParams({ aspect: e.target.value as Aspect })}
          className="border rounded px-2 py-1 text-sm"
        >
          {ASPECTS.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground ml-2">质量</label>
        <select
          aria-label="tier"
          value={selectedTier}
          onChange={(e) => setParams({ tier: e.target.value as Tier })}
          className="border rounded px-2 py-1 text-sm"
        >
          {TIERS.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground ml-2">张数</label>
        <input
          aria-label="n"
          type="number" min={1} max={4}
          value={params.n ?? 1}
          onChange={(e) => setParams({ n: Number(e.target.value) })}
          className="border rounded px-2 py-1 w-16 text-sm"
        />
        <div className="flex-1" />
        {busy && onCancel && <Button variant="outline" onClick={onCancel}>取消</Button>}
        <Button onClick={onGenerate} disabled={disabled}>生成</Button>
      </div>
      {previews.length > 0 && (
        <div className="text-xs text-muted-foreground">
          预计输出尺寸：
          {previews.map((f, i) => (
            <span key={i} className="ml-2">
              {f.name} → <code>{f.size}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
