import { useLocale } from './useLocale'
import { dict, type TKey, type Locale } from './dict'

type Vars = Record<string, string | number>

function format(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function translate(locale: Locale, key: TKey, vars?: Vars): string {
  const val = dict[locale]?.[key] ?? dict.zh[key] ?? key
  return format(val, vars)
}

export function useT() {
  const locale = useLocale((s) => s.locale)
  return (key: TKey, vars?: Vars) => translate(locale, key, vars)
}

export function getT() {
  const locale = useLocale.getState().locale
  return (key: TKey, vars?: Vars) => translate(locale, key, vars)
}
