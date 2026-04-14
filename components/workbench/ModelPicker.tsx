'use client'
import { useState, type ReactNode, cloneElement, isValidElement } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Provider = { id: string; displayName: string; capabilities: unknown }
type Props = { providers: Provider[]; onSelect: (id: string) => void; trigger: ReactNode }

export function ModelPicker({ providers, onSelect, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => setOpen(true) })
    : trigger
  return (
    <>
      {triggerEl}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Select a model</DialogTitle>
          <div className="grid gap-2">
            {providers.map(p => (
              <Button key={p.id} variant="outline" onClick={() => { onSelect(p.id); setOpen(false) }}>
                {p.displayName}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
