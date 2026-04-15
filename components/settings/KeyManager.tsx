'use client'
import { useEffect, useState } from 'react'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { setCreds, getCreds, deleteKey } from '@/lib/storage/keys'
import { getKeyFields } from '@/lib/providers/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

bootstrapProviders()

function fieldLabel(field: string): string {
  if (field === 'apiKey') return 'API Key'
  // capitalize first letter
  return field.charAt(0).toUpperCase() + field.slice(1)
}

export function KeyManager() {
  const providers = listProviders()
  // values: { [providerId]: { [field]: string } }
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    const init: Record<string, Record<string, string>> = {}
    providers.forEach(p => {
      const creds = getCreds(p.id)
      const fields = getKeyFields(p)
      const entry: Record<string, string> = {}
      fields.forEach(f => { entry[f] = creds?.[f] ?? '' })
      init[p.id] = entry
    })
    setValues(init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      {providers.map(p => {
        const fields = getKeyFields(p)
        return (
          <div key={p.id} className="flex items-end gap-2 border p-3 rounded">
            <div className="flex-1 space-y-2">
              <p className="font-medium text-sm">{p.displayName}</p>
              {fields.map(field => (
                <div key={field}>
                  <Label htmlFor={`key-${p.id}-${field}`}>{fieldLabel(field)}</Label>
                  <Input
                    id={`key-${p.id}-${field}`}
                    type="password"
                    value={values[p.id]?.[field] ?? ''}
                    onChange={(e) => setValues(v => ({
                      ...v,
                      [p.id]: { ...(v[p.id] ?? {}), [field]: e.target.value },
                    }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => setCreds(p.id, values[p.id] ?? {})}>
              Save {p.displayName}
            </Button>
            <Button variant="outline" onClick={() => {
              deleteKey(p.id)
              const empty: Record<string, string> = {}
              fields.forEach(f => { empty[f] = '' })
              setValues(v => ({ ...v, [p.id]: empty }))
            }}>
              Clear
            </Button>
          </div>
        )
      })}
    </div>
  )
}
