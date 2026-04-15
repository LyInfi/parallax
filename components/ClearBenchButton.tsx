'use client'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { ConfirmButton } from '@/components/ui/confirm-button'

export function ClearBenchButton() {
  const clearCards = useModelStore((s) => s.clear)
  const cardsLen = useModelStore((s) => s.cards.length)
  const resetPrompt = usePromptStore((s) => s.reset)

  return (
    <ConfirmButton
      size="sm" variant="ghost" disabled={cardsLen === 0}
      title="清空工作台" description="卡片、提示词、附件都会被清除。"
      confirmLabel="清空"
      onConfirm={() => { clearCards(); resetPrompt() }}
    >清空</ConfirmButton>
  )
}
