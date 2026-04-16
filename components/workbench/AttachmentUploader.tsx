'use client'
import { useRef, useEffect, useState } from 'react'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Button } from '@/components/ui/button'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useT, getT } from '@/lib/i18n/useT'

const MAX_SIZE = 10 * 1024 * 1024

export function AttachmentTrigger() {
  const { attachments, setAttachments } = usePromptStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()

  const onFiles = (files: FileList | null) => {
    if (!files) return
    const valid: File[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) { toast.error(getT()('attach.tooLarge', { name: f.name })); continue }
      valid.push(f)
    }
    setAttachments([...attachments, ...valid])
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t('attach.upload')}
        title={t('attach.upload')}
        onClick={() => inputRef.current?.click()}
        className="h-10 w-10 shrink-0"
      >
        <ImagePlus className="h-5 w-5" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
      />
    </>
  )
}

export function AttachmentThumbs() {
  const { attachments, setAttachments } = usePromptStore()
  const [urls, setUrls] = useState<string[]>([])
  const t = useT()

  useEffect(() => {
    const next = attachments.map((f) => URL.createObjectURL(f))
    setUrls(next)
    return () => { next.forEach(URL.revokeObjectURL) }
  }, [attachments])

  if (attachments.length === 0) return null
  return (
    <div className="flex gap-2 flex-wrap">
      {attachments.map((f, i) => (
        <div key={i} className="relative group h-16 w-16">
          <img src={urls[i]} alt={f.name} className="h-16 w-16 rounded object-cover border" />
          <button
            type="button"
            aria-label={t('attach.remove', { name: f.name })}
            onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Backward-compatible default export (kept for any other import paths)
export function AttachmentUploader() {
  return (
    <div className="space-y-2">
      <AttachmentTrigger />
      <AttachmentThumbs />
    </div>
  )
}
