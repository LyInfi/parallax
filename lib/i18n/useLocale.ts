import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { DEFAULT_LOCALE, type Locale } from './dict'

type State = {
  locale: Locale
  setLocale: (l: Locale) => void
  toggle: () => void
}

export const useLocale = create<State>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
      toggle: () => set((s) => ({ locale: s.locale === 'zh' ? 'en' : 'zh' })),
    }),
    { name: 'parallax-locale', storage: createJSONStorage(() => localStorage) },
  ),
)
