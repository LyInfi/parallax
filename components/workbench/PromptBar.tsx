'use client'
import { useEffect, useState } from 'react'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { useModelStore } from '@/lib/store/useModelStore'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AttachmentTrigger, AttachmentThumbs } from './AttachmentUploader'
import { SIZE_PRESETS, resolveSize } from '@/lib/providers/size-catalog'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'

bootstrapProviders()

type Props = { onGenerate: () => void; busy?: boolean; onCancel?: () => void }

export function PromptBar({ onGenerate, busy, onCancel }: Props) {
  const { prompt, setPrompt, params, setParams } = usePromptStore()
  const cards = useModelStore((s) => s.cards)
  const [providers, setProviders] = useState<Array<{ id: string; displayName: string; capabilities: { sizes: string[] } }>>([])
  useEffect(() => { setProviders(listProviders()) }, [])

  const disabled = !prompt.trim() || !!busy
  const selectedSize = params.size ?? '1024x1024'

  const providerById = new Map(providers.map(p => [p.id, p]))
  const activeProviderIds = Array.from(new Set(cards.map(c => c.providerId)))
  const fallbacks = activeProviderIds
    .map(id => {
      const p = providerById.get(id)
      if (!p) return null
      const resolved = resolveSize(selectedSize, p.capabilities.sizes)
      return resolved !== selectedSize ? { name: p.displayName, resolved } : null
    })
    .filter(Boolean) as Array<{ name: string; resolved: string }>

  return (
    <div className="border-t p-3 space-y-2 bg-background">
      <AttachmentThumbs />
      <div className="flex gap-2 items-start">
        <AttachmentTrigger />
        <Textarea
          placeholder="Describe what you want to generate…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="flex-1"
        />
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">尺寸</label>
        <select
          aria-label="size"
          value={selectedSize}
          onChange={(e) => setParams({ size: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        >
          {SIZE_PRESETS.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
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
      {fallbacks.length > 0 && (
        <div className="text-xs text-muted-foreground">
          ⚠ 不支持该尺寸的模型会映射到最近值：
          {fallbacks.map((f, i) => (
            <span key={i} className="ml-2">
              {f.name} → <code>{f.resolved}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
