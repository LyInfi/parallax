'use client'
import { useEffect, useState } from 'react'
import { ModelPicker } from '@/components/workbench/ModelPicker'
import { Button } from '@/components/ui/button'
import { useModelStore } from '@/lib/store/useModelStore'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'

bootstrapProviders()

export function AddModelButton() {
  const addCard = useModelStore((s) => s.addCard)
  const [providers, setProviders] = useState<Array<{ id: string; displayName: string; capabilities: unknown }>>([])
  useEffect(() => { setProviders(listProviders()) }, [])
  return (
    <ModelPicker
      providers={providers}
      onSelect={addCard}
      trigger={<Button size="sm" variant="outline">+ 添加模型</Button>}
    />
  )
}
