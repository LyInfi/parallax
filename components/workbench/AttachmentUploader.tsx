'use client'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { Button } from '@/components/ui/button'

const MAX_SIZE = 10 * 1024 * 1024

export function AttachmentUploader() {
  const { attachments, setAttachments } = usePromptStore()

  const onFiles = (files: FileList | null) => {
    if (!files) return
    const valid: File[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) { alert(`${f.name} exceeds 10MB`); continue }
      valid.push(f)
    }
    setAttachments([...attachments, ...valid])
  }

  return (
    <div className="flex gap-2 items-center flex-wrap">
      <input
        aria-label="attachments"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => onFiles(e.target.files)}
      />
      {attachments.map((f, i) => (
        <div key={i} className="flex items-center gap-1 text-sm border px-2 py-1 rounded">
          {f.name}
          <Button size="sm" variant="ghost" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>×</Button>
        </div>
      ))}
    </div>
  )
}
