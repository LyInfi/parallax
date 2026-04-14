'use client'
import { ModelPicker } from './ModelPicker'
import { Card } from '@/components/ui/card'

type Provider = { id: string; displayName: string; capabilities: unknown }

export function AddModelCard({ providers, onAdd }: { providers: Provider[]; onAdd: (id: string) => void }) {
  return (
    <ModelPicker
      providers={providers}
      onSelect={onAdd}
      trigger={
        <Card className="flex items-center justify-center h-40 cursor-pointer border-dashed text-4xl text-muted-foreground hover:border-foreground">
          +
        </Card>
      }
    />
  )
}
