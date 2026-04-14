'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Provider = { id: string; displayName: string }
type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  providers: Provider[]
  onConfirm: (ids: string[]) => void
}

export function MultiModelPicker({ open, onOpenChange, providers, onConfirm }: Props) {
  const [sel, setSel] = useState<string[]>([])
  useEffect(() => { if (open) setSel([]) }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Choose models for next round</DialogTitle>
        <div className="grid gap-2">
          {providers.map(p => (
            <label key={p.id} className="flex items-center gap-2 border rounded p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sel.includes(p.id)}
                onChange={(e) => setSel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))}
              />
              {p.displayName}
            </label>
          ))}
        </div>
        <Button disabled={sel.length === 0} onClick={() => { onConfirm(sel); onOpenChange(false) }}>Continue</Button>
      </DialogContent>
    </Dialog>
  )
}
