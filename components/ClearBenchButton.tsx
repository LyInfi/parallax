'use client'
import { Button } from '@/components/ui/button'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'

export function ClearBenchButton() {
  const clearCards = useModelStore((s) => s.clear)
  const cardsLen = useModelStore((s) => s.cards.length)
  const resetPrompt = usePromptStore((s) => s.reset)
  const disabled = cardsLen === 0

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={() => {
        if (!confirm('清空工作台（卡片 + 提示词 + 附件）？')) return
        clearCards()
        resetPrompt()
      }}
    >
      清空
    </Button>
  )
}
