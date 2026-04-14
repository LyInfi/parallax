'use client'
import { useEffect, useState } from 'react'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { setKey, getKey, deleteKey } from '@/lib/storage/keys'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

bootstrapProviders()

export function KeyManager() {
  const providers = listProviders()
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const init: Record<string, string> = {}
    providers.forEach(p => { init[p.id] = getKey(p.id) ?? '' })
    setValues(init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      {providers.map(p => (
        <div key={p.id} className="flex items-end gap-2 border p-3 rounded">
          <div className="flex-1">
            <Label htmlFor={`key-${p.id}`}>{p.displayName}</Label>
            <Input
              id={`key-${p.id}`}
              type="password"
              value={values[p.id] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [p.id]: e.target.value }))}
            />
          </div>
          <Button onClick={() => setKey(p.id, values[p.id])}>
            Save {p.displayName}
          </Button>
          <Button variant="outline" onClick={() => { deleteKey(p.id); setValues(v => ({ ...v, [p.id]: '' })) }}>
            Clear
          </Button>
        </div>
      ))}
    </div>
  )
}
