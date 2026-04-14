'use client'
import { useImperativeHandle, forwardRef, useState } from 'react'
import { ModelCard } from './ModelCard'
import { useGenerate } from '@/lib/hooks/useGenerate'
import { getKey } from '@/lib/storage/keys'
import { putAsset } from '@/lib/storage/gallery'
import { toast } from 'sonner'

export type CardControllerHandle = {
  run: (args: { prompt: string; attachments: Blob[]; size?: string; n?: number; seed?: number; parentAssetId?: string }) => void
  cancel: () => void
}

type Props = {
  cardId: string
  providerId: string
  providerName: string
  onRemove: () => void
  onDeriveFrom: (url: string) => void
}

export const CardController = forwardRef<CardControllerHandle, Props>(function CardController(
  { cardId, providerId, providerName, onRemove, onDeriveFrom }, ref,
) {
  const gen = useGenerate()
  const [lastCtx, setLastCtx] = useState<{ prompt: string; params: Record<string, unknown>; parentAssetId?: string } | null>(null)

  useImperativeHandle(ref, () => ({
    run: ({ prompt, attachments, size, n, seed, parentAssetId }) => {
      const apiKey = getKey(providerId)
      if (!apiKey) { toast.error(`Missing API key for ${providerName}. Open Settings.`); return }
      setLastCtx({ prompt, params: { size, n, seed }, parentAssetId })
      gen.start({ providerId, apiKey, input: { prompt, referenceImages: attachments, size, n, seed } })
    },
    cancel: () => gen.cancel(),
  }), [gen, providerId, providerName])

  const saveFavorite = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    const id = crypto.randomUUID()
    await putAsset({
      id, sessionId: cardId, providerId,
      blob, thumbBlob: blob,
      meta: {
        prompt: lastCtx?.prompt ?? '',
        params: lastCtx?.params ?? {},
        createdAt: Date.now(),
        favorited: true,
        parentAssetId: lastCtx?.parentAssetId,
      },
    })
    toast.success('Saved to gallery')
  }

  const download = (url: string) => {
    const a = document.createElement('a')
    a.href = url; a.download = `${providerId}-${Date.now()}.png`
    a.click()
  }

  return (
    <ModelCard
      card={{ cardId, providerId, status: gen.status, images: gen.images.map(u => ({ url: u })), error: gen.error ?? undefined }}
      providerName={providerName}
      onRetry={() => lastCtx && gen.start({
        providerId, apiKey: getKey(providerId) ?? '',
        input: { prompt: lastCtx.prompt, size: lastCtx.params.size as string | undefined, n: lastCtx.params.n as number | undefined, seed: lastCtx.params.seed as number | undefined },
      })}
      onFavorite={saveFavorite}
      onDownload={download}
      onDeriveFrom={onDeriveFrom}
      onRemove={onRemove}
    />
  )
})
