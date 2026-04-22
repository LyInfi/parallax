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
import {
  EXPERIMENTAL_CONSENT_VERSION,
  ExperimentalBanner,
} from '@/components/settings/ExperimentalBanner'
import { GeminiWebLoginButton } from '@/components/settings/GeminiWebLoginButton'
import { hasConsent } from '@/lib/storage/consent'

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
  const [consents, setConsents] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const initV: Record<string, Record<string, string>> = {}
    const initC: Record<string, Record<string, string>> = {}
    const initConsent: Record<string, boolean> = {}
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

      if (p.isExperimental) {
        initConsent[p.id] = hasConsent(p.id, EXPERIMENTAL_CONSENT_VERSION)
      }
    })
    setValues(initV)
    setConfigs(initC)
    setConsents(initConsent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      {providers.map(p => {
        const keyFields = getKeyFields(p)
        const cfgFields = getConfigFields(p)
        const experimentalGate = !!p.isExperimental
        const consented = experimentalGate ? !!consents[p.id] : true
        return (
          <div key={p.id} className="border p-3 rounded space-y-3">
            {experimentalGate && (
              <ExperimentalBanner
                providerId={p.id}
                disclaimer={p.experimentalDisclaimer}
                onConsentChange={(accepted) =>
                  setConsents(prev => ({ ...prev, [p.id]: accepted }))
                }
              />
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <p className="font-medium text-sm">{p.displayName}</p>
                {p.id === 'gemini-web' && (
                  <GeminiWebLoginButton
                    onSuccess={() => {
                      const creds = getCreds(p.id)
                      const next: Record<string, string> = {}
                      keyFields.forEach(f => { next[f] = creds?.[f] ?? '' })
                      setValues(v => ({ ...v, [p.id]: next }))
                    }}
                  />
                )}
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
                {cfgFields.map(field => {
                  const hintId = field.hint ? `hint-${p.id}-${field.id}` : undefined
                  return (
                    <div key={field.id}>
                      <Label htmlFor={`cfg-${p.id}-${field.id}`}>{field.label}</Label>
                      {field.type === 'select' ? (
                        <select
                          id={`cfg-${p.id}-${field.id}`}
                          aria-describedby={hintId}
                          className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
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
                          aria-describedby={hintId}
                          value={configs[p.id]?.[field.id] ?? ''}
                          onChange={(e) => setConfigs(c => ({
                            ...c,
                            [p.id]: { ...(c[p.id] ?? {}), [field.id]: e.target.value },
                          }))}
                        />
                      )}
                      {field.hint && (
                        <p id={hintId} className="text-xs text-muted-foreground mt-1">{field.hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>
              <Button
                disabled={!consented}
                title={!consented ? '请先勾选实验性 provider 的风险确认' : undefined}
                onClick={() => {
                  setCreds(p.id, values[p.id] ?? {})
                  setConfig(p.id, configs[p.id] ?? {})
                }}
              >
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
