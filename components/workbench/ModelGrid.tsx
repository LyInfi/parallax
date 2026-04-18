'use client'
import { useRef } from 'react'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { CardController, type CardControllerHandle } from './CardController'
import { PromptBar } from './PromptBar'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { putSession } from '@/lib/storage/gallery'
import { fetchImageBlob } from '@/lib/image-fetch'
import { getConfig } from '@/lib/storage/keys'
import { toast } from 'sonner'
import { getT } from '@/lib/i18n/useT'
import { useT } from '@/lib/i18n/useT'

bootstrapProviders()

function effectiveModel(providerId: string, defaultModel?: string): string | undefined {
  const override = getConfig(providerId).model?.trim()
  return override || defaultModel
}

export function ModelGrid() {
  const t = useT()
  const { cards, removeCard } = useModelStore()
  usePromptStore() // subscribe for re-renders; live values read via getState()
  const providers = listProviders()
  const byId = new Map(providers.map(p => [p.id, p]))
  const controllers = useRef<Map<string, CardControllerHandle>>(new Map())

  const runCards = async (cardIds: string[]) => {
    const allCards = useModelStore.getState().cards.filter(c => cardIds.includes(c.cardId))
    if (allCards.length === 0) return
    const ps = usePromptStore.getState()
    const sessionId = crypto.randomUUID()
    const models: Record<string, string> = {}
    for (const c of allCards) {
      const m = effectiveModel(c.providerId, byId.get(c.providerId)?.defaultModel)
      if (m) models[c.providerId] = m
    }
    const sizeSpec = ps.params.aspect && ps.params.tier
      ? { aspect: ps.params.aspect, tier: ps.params.tier }
      : undefined

    await putSession({
      id: sessionId,
      prompt: ps.prompt,
      params: { aspect: ps.params.aspect, tier: ps.params.tier, n: ps.params.n, seed: ps.params.seed },
      providerIds: allCards.map(c => c.providerId),
      models,
      createdAt: Date.now(),
    })
    for (const c of allCards) {
      controllers.current.get(c.cardId)?.run({
        sessionId,
        prompt: ps.prompt,
        attachments: ps.attachments,
        size: sizeSpec,
        n: ps.params.n,
        seed: ps.params.seed,
      })
    }
  }

  const runAll = () => runCards(useModelStore.getState().cards.map(c => c.cardId))
  const regenerateCard = (cardId: string) => runCards([cardId])
  const cancelAll = () => { controllers.current.forEach(c => c.cancel()) }

  /**
   * Add the given image as the current reference attachment.
   * Does NOT trigger generation — user continues editing prompt, then clicks Generate.
   */
  const useAsReference = async (url: string) => {
    try {
      const blob = await fetchImageBlob(url)
      const f = new File([blob], 'reference.png', { type: blob.type || 'image/png' })
      usePromptStore.getState().setAttachments([f])
      toast.success(getT()('grid.derive.added'))
    } catch (e) {
      console.error('[useAsReference] failed', e)
      toast.error(getT()('grid.derive.failed'))
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div
        className="flex-1 overflow-auto p-4 grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        {cards.map(c => {
          const p = byId.get(c.providerId)
          return (
            <CardController
              key={c.cardId}
              ref={(h) => { if (h) controllers.current.set(c.cardId, h); else controllers.current.delete(c.cardId) }}
              cardId={c.cardId}
              providerId={c.providerId}
              providerName={p?.displayName ?? c.providerId}
              modelName={effectiveModel(c.providerId, p?.defaultModel)}
              onRemove={() => removeCard(c.cardId)}
              onRegenerate={() => regenerateCard(c.cardId)}
              onDeriveFrom={useAsReference}
            />
          )
        })}
        {cards.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-20">
            {t('grid.empty')}
          </div>
        )}
      </div>
      <PromptBar onGenerate={runAll} onCancel={cancelAll} />
    </div>
  )
}
