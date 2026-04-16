'use client'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { useT } from '@/lib/i18n/useT'

export function ClearBenchButton() {
  const clearCards = useModelStore((s) => s.clear)
  const cardsLen = useModelStore((s) => s.cards.length)
  const resetPrompt = usePromptStore((s) => s.reset)
  const t = useT()

  return (
    <ConfirmButton
      size="sm" variant="ghost" disabled={cardsLen === 0}
      title={t('nav.clear.title')} description={t('nav.clear.desc')}
      confirmLabel={t('nav.clear.confirm')}
      onConfirm={() => { clearCards(); resetPrompt() }}
    >{t('nav.clear')}</ConfirmButton>
  )
}
