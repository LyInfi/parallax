'use client'
import { useEffect, useState } from 'react'
import { listProviders } from '@/lib/providers/registry'
import { bootstrapProviders } from '@/lib/providers'
import { setCreds, getCreds, deleteKey, setConfig, getConfig } from '@/lib/storage/keys'
import { getKeyFields, getConfigFields } from '@/lib/providers/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useT } from '@/lib/i18n/useT'

bootstrapProviders()

function fieldLabel(field: string): string {
  if (field === 'apiKey') return 'API Key'
  return field.charAt(0).toUpperCase() + field.slice(1)
}

export function KeyManager() {
  const providers = listProviders()
  const t = useT()
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    const initV: Record<string, Record<string, string>> = {}
    const initC: Record<string, Record<string, string>> = {}
    providers.forEach(p => {
      const creds = getCreds(p.id)
      const fields = getKeyFields(p)
      const entry: Record<string, string> = {}
      fields.forEach(f => { entry[f] = creds?.[f] ?? '' })
      initV[p.id] = entry

      const cfg = getConfig(p.id)
      const cfgEntry: Record<string, string> = {}
      getConfigFields(p).forEach(f => { cfgEntry[f.id] = cfg[f.id] ?? f.default ?? '' })
      initC[p.id] = cfgEntry
    })
    setValues(initV)
    setConfigs(initC)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      {providers.map(p => {
        const keyFields = getKeyFields(p)
        const cfgFields = getConfigFields(p)
        return (
          <div key={p.id} className="border p-3 rounded space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <p className="font-medium text-sm">{p.displayName}</p>
                {keyFields.map(field => (
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
                {cfgFields.map(field => (
                  <div key={field.id}>
                    <Label htmlFor={`cfg-${p.id}-${field.id}`}>{field.label}</Label>
                    {field.type === 'select' ? (
                      <select
                        id={`cfg-${p.id}-${field.id}`}
                        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={configs[p.id]?.[field.id] ?? field.default ?? ''}
                        onChange={(e) => setConfigs(c => ({
                          ...c,
                          [p.id]: { ...(c[p.id] ?? {}), [field.id]: e.target.value },
                        }))}
                      >
                        {field.options?.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`cfg-${p.id}-${field.id}`}
                        type="text"
                        placeholder={field.placeholder}
                        value={configs[p.id]?.[field.id] ?? ''}
                        onChange={(e) => setConfigs(c => ({
                          ...c,
                          [p.id]: { ...(c[p.id] ?? {}), [field.id]: e.target.value },
                        }))}
                      />
                    )}
                    {field.hint && (
                      <p className="text-xs text-muted-foreground mt-1">{field.hint}</p>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={() => {
                setCreds(p.id, values[p.id] ?? {})
                setConfig(p.id, configs[p.id] ?? {})
              }}>
                {t('settings.save', { name: p.displayName })}
              </Button>
              <Button variant="outline" onClick={() => {
                deleteKey(p.id)
                const emptyK: Record<string, string> = {}
                keyFields.forEach(f => { emptyK[f] = '' })
                setValues(v => ({ ...v, [p.id]: emptyK }))
              }}>
                {t('settings.clear')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
