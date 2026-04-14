'use client'
import { useRef } from 'react'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { CardController, type CardControllerHandle } from './CardController'
import { AddModelCard } from './AddModelCard'
import { PromptBar } from './PromptBar'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'

bootstrapProviders()

export function ModelGrid() {
  const { cards, addCard, removeCard } = useModelStore()
  const { prompt, attachments, params } = usePromptStore()
  const providers = listProviders()
  const byId = new Map(providers.map(p => [p.id, p]))
  const controllers = useRef<Map<string, CardControllerHandle>>(new Map())

  const runAll = () => {
    for (const c of cards) {
      controllers.current.get(c.cardId)?.run({
        prompt, attachments, size: params.size, n: params.n, seed: params.seed,
      })
    }
  }
  const cancelAll = () => { controllers.current.forEach(c => c.cancel()) }

  const deriveFrom = async (url: string) => {
    const blob = await (await fetch(url)).blob()
    const f = new File([blob], 'ref.png', { type: blob.type })
    usePromptStore.getState().setAttachments([f])
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
    </div>
  )
}
