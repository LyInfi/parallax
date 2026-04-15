'use client'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AttachmentTrigger, AttachmentThumbs } from './AttachmentUploader'

type Props = { onGenerate: () => void; busy?: boolean; onCancel?: () => void }

export function PromptBar({ onGenerate, busy, onCancel }: Props) {
  const { prompt, setPrompt, params, setParams } = usePromptStore()
  const disabled = !prompt.trim() || !!busy
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
      <div className="flex gap-2 items-center">
        <select
          aria-label="size"
          value={params.size ?? '1024x1024'}
          onChange={(e) => setParams({ size: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        >
          <option>512x512</option>
          <option>1024x1024</option>
        </select>
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
    </div>
  )
}
