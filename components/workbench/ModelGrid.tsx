'use client'
import { useRef, useState } from 'react'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { CardController, type CardControllerHandle } from './CardController'
import { AddModelCard } from './AddModelCard'
import { PromptBar } from './PromptBar'
import { MultiModelPicker } from './MultiModelPicker'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { putAsset } from '@/lib/storage/gallery'

bootstrapProviders()

export function ModelGrid() {
  const { cards, addCard, removeCard } = useModelStore()
  usePromptStore() // subscribed for re-renders; live values read via getState() in runAll
  const providers = listProviders()
  const byId = new Map(providers.map(p => [p.id, p]))
  const controllers = useRef<Map<string, CardControllerHandle>>(new Map())

  const [pendingRef, setPendingRef] = useState<{ blob: Blob; parentAssetId?: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const runAll = () => {
    const latest = useModelStore.getState().cards
    const ps = usePromptStore.getState()
    for (const c of latest) {
      controllers.current.get(c.cardId)?.run({
        prompt: ps.prompt, attachments: ps.attachments,
        size: ps.params.size, n: ps.params.n, seed: ps.params.seed,
        parentAssetId: pendingRef?.parentAssetId,
      })
    }
  }
  const cancelAll = () => { controllers.current.forEach(c => c.cancel()) }

  const deriveFrom = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    setPendingRef({ blob })
    setPickerOpen(true)
  }

  const confirmDerive = async (ids: string[]) => {
    if (!pendingRef) return
    const parentId = crypto.randomUUID()
    await putAsset({
      id: parentId, sessionId: 'derive-source', providerId: 'derive',
      blob: pendingRef.blob, thumbBlob: pendingRef.blob,
      meta: { prompt: usePromptStore.getState().prompt, params: {}, createdAt: Date.now(), favorited: false },
    })
    const f = new File([pendingRef.blob], 'ref.png', { type: pendingRef.blob.type })
    usePromptStore.getState().setAttachments([f])
    useModelStore.setState({ cards: ids.map(id => ({ cardId: crypto.randomUUID(), providerId: id })) })
    setPendingRef({ blob: pendingRef.blob, parentAssetId: parentId })
    requestAnimationFrame(() => requestAnimationFrame(runAll))
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-auto p-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {cards.map(c => {
          const p = byId.get(c.providerId)
          return (
            <CardController
              key={c.cardId}
              ref={(h) => { if (h) controllers.current.set(c.cardId, h); else controllers.current.delete(c.cardId) }}
              cardId={c.cardId}
              providerId={c.providerId}
              providerName={p?.displayName ?? c.providerId}
              onRemove={() => removeCard(c.cardId)}
              onDeriveFrom={deriveFrom}
            />
          )
        })}
        <AddModelCard providers={providers} onAdd={addCard} />
      </div>
      <PromptBar onGenerate={runAll} onCancel={cancelAll} />
      <MultiModelPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        providers={providers}
        onConfirm={confirmDerive}
      />
    </div>
  )
}
