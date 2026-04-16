'use client'
import { useLocale } from '@/lib/i18n/useLocale'
import { LOCALES, type Locale } from '@/lib/i18n/dict'

const LABELS: Record<Locale, string> = { zh: '中文', en: 'English' }

export function LocaleToggle() {
  const locale = useLocale((s) => s.locale)
  const setLocale = useLocale((s) => s.setLocale)
  return (
    <select
      aria-label="language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="border rounded px-2 py-1 text-sm bg-background"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>{LABELS[l]}</option>
      ))}
    </select>
  )
}
