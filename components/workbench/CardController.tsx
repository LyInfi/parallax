'use client'
import { useImperativeHandle, forwardRef, useState, useEffect, useRef } from 'react'
import { ModelCard } from './ModelCard'
import { useGenerate } from '@/lib/hooks/useGenerate'
import { getCreds, getConfig } from '@/lib/storage/keys'
import { putAsset, setFavorite, latestAssetsOfCard } from '@/lib/storage/gallery'
import { fetchImageBlob } from '@/lib/image-fetch'
import { toast } from 'sonner'

export type CardControllerHandle = {
  run: (args: {
    sessionId: string
    prompt: string
    attachments: Blob[]
    size?: string
    n?: number
    seed?: number
    parentAssetId?: string
  }) => void
  cancel: () => void
}

type Props = {
  cardId: string
  providerId: string
  providerName: string
  /** Effective model id to display on the card and stamp onto saved assets */
  modelName?: string
  onRemove: () => void
  onDeriveFrom: (url: string) => void
}

export const CardController = forwardRef<CardControllerHandle, Props>(function CardController(
  { cardId, providerId, providerName, modelName, onRemove, onDeriveFrom }, ref,
) {
  const gen = useGenerate()
  const [lastCtx, setLastCtx] = useState<{
    sessionId: string
    prompt: string
    params: Record<string, unknown>
    parentAssetId?: string
  } | null>(null)

  const seenUrls = useRef(new Set<string>())
  const urlToAsset = useRef(new Map<string, string>())
  // Restored images from the last generation for this card, rehydrated on mount
  const [restoredImages, setRestoredImages] = useState<{ url: string; assetId: string }[]>([])
  const objectUrlsRef = useRef<string[]>([])

  // Rehydrate latest-session images for this card on mount
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const assets = await latestAssetsOfCard(cardId)
        if (cancelled || assets.length === 0) return
        const items = assets.map(a => {
          const url = URL.createObjectURL(a.blob)
          objectUrlsRef.current.push(url)
          urlToAsset.current.set(url, a.id)
          return { url, assetId: a.id }
        })
        setRestoredImages(items)
      } catch (e) {
        console.error('[rehydrate] failed', cardId, e)
      }
    })()
    return () => {
      cancelled = true
      objectUrlsRef.current.forEach(URL.revokeObjectURL)
      objectUrlsRef.current = []
    }
  }, [cardId])

  useImperativeHandle(ref, () => ({
    run: ({ sessionId, prompt, attachments, size, n, seed, parentAssetId }) => {
      const creds = getCreds(providerId)
      if (!creds || Object.keys(creds).length === 0) {
        toast.error(`Missing API key for ${providerName}. Open Settings.`)
        return
      }
      // For single-field (just apiKey), send raw string for back-compat with existing adapters
      const keyPayload = Object.keys(creds).length === 1 && 'apiKey' in creds
        ? creds.apiKey
        : JSON.stringify(creds)
      const cfg = getConfig(providerId)
      const providerOverrides = Object.fromEntries(
        Object.entries(cfg).filter(([, v]) => v && v.trim() !== ''),
      )
      // Clear seen URLs so a new generation auto-saves fresh
      seenUrls.current.clear()
      urlToAsset.current.clear()
      // Drop restored previews (new generation in progress)
      objectUrlsRef.current.forEach(URL.revokeObjectURL)
      objectUrlsRef.current = []
      setRestoredImages([])
      setLastCtx({ sessionId, prompt, params: { size, n, seed }, parentAssetId })
      gen.start({
        providerId, apiKey: keyPayload,
        input: {
          prompt, referenceImages: attachments, size, n, seed,
          ...(Object.keys(providerOverrides).length > 0 && { providerOverrides }),
        },
      })
    },
    cancel: () => gen.cancel(),
  }), [gen, providerId, providerName])

  // Auto-save every new image URL
  useEffect(() => {
    for (const url of gen.images) {
      if (seenUrls.current.has(url)) continue
      seenUrls.current.add(url)
      void (async () => {
        try {
          const blob = await fetchImageBlob(url)
          const id = crypto.randomUUID()
          await putAsset({
            id,
            sessionId: lastCtx?.sessionId ?? cardId,
            providerId,
            blob,
            thumbBlob: blob,
            meta: {
              prompt: lastCtx?.prompt ?? '',
              params: lastCtx?.params ?? {},
              createdAt: Date.now(),
              favorited: false,
              parentAssetId: lastCtx?.parentAssetId,
              ...(modelName && { model: modelName }),
              cardId,
            },
          })
          urlToAsset.current.set(url, id)
        } catch (e) {
          console.error('[auto-save] failed for', providerId, url, e)
        }
      })()
    }
  }, [gen.images, cardId, providerId, lastCtx])

  const saveFavorite = async (url: string) => {
    const id = urlToAsset.current.get(url)
    if (id) {
      await setFavorite(id, true)
      toast.success('已加入收藏')
    } else {
      // Fallback: auto-save hasn't finished yet (race), save fresh as favorited
      try {
        const blob = await fetchImageBlob(url)
        const newId = crypto.randomUUID()
        await putAsset({
          id: newId,
          sessionId: lastCtx?.sessionId ?? cardId,
          providerId,
          blob,
          thumbBlob: blob,
          meta: {
            prompt: lastCtx?.prompt ?? '',
            params: lastCtx?.params ?? {},
            createdAt: Date.now(),
            favorited: true,
            parentAssetId: lastCtx?.parentAssetId,
          },
        })
        urlToAsset.current.set(url, newId)
        toast.success('已加入收藏')
      } catch {
        toast.error('保存失败')
      }
    }
  }

  const download = (url: string) => {
    const a = document.createElement('a')
    a.href = url; a.download = `${providerId}-${Date.now()}.png`
    a.click()
  }

  const showingRestored = gen.images.length === 0 && restoredImages.length > 0 && gen.status === 'idle'
  const displayImages = showingRestored
    ? restoredImages.map(r => ({ url: r.url }))
    : gen.images.map(u => ({ url: u }))
  const displayStatus = showingRestored ? 'done' : gen.status

  return (
    <ModelCard
      card={{ cardId, providerId, status: displayStatus, images: displayImages, error: gen.error ?? undefined }}
      providerName={providerName}
      modelName={modelName}
      onRetry={() => {
        if (!lastCtx) return
        const retryCreds = getCreds(providerId)
        const retryKey = retryCreds && Object.keys(retryCreds).length === 1 && 'apiKey' in retryCreds
          ? retryCreds.apiKey
          : JSON.stringify(retryCreds ?? {})
        gen.start({
          providerId, apiKey: retryKey,
          input: { prompt: lastCtx.prompt, size: lastCtx.params.size as string | undefined, n: lastCtx.params.n as number | undefined, seed: lastCtx.params.seed as number | undefined },
        })
      }}
      onFavorite={saveFavorite}
      onDownload={download}
      onDeriveFrom={onDeriveFrom}
      onRemove={onRemove}
    />
  )
})
