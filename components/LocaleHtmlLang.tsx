'use client'
import { useEffect } from 'react'
import { useLocale } from '@/lib/i18n/useLocale'

export function LocaleHtmlLang() {
  const locale = useLocale((s) => s.locale)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])
  return null
}
