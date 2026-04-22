'use client'
import { useEffect, useState } from 'react'
import { hasConsent, setConsent } from '@/lib/storage/consent'

const CONSENT_VERSION = 'v1'

export function ExperimentalBanner({
  providerId,
  disclaimer,
  onConsentChange,
}: {
  providerId: string
  disclaimer?: string
  onConsentChange?: (accepted: boolean) => void
}) {
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    const initial = hasConsent(providerId, CONSENT_VERSION)
    setAccepted(initial)
    onConsentChange?.(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId])

  const toggle = (next: boolean) => {
    setAccepted(next)
    if (next) setConsent(providerId, CONSENT_VERSION)
    else setConsent(providerId, '')
    onConsentChange?.(next)
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/60 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="select-none font-semibold">⚠ DANGER · UNOFFICIAL</span>
      </div>
      {disclaimer && (
        <p className="mt-1 leading-snug text-destructive/90">{disclaimer}</p>
      )}
      <label className="mt-2 flex items-center gap-2 text-foreground">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 accent-destructive"
          data-testid={`experimental-consent-${providerId}`}
        />
        <span>我已了解并愿意承担上述风险（I acknowledge the risk）</span>
      </label>
    </div>
  )
}

export const EXPERIMENTAL_CONSENT_VERSION = CONSENT_VERSION
