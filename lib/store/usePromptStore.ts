import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Aspect, Tier } from '@/lib/providers/aspect'

type Params = {
  /** @deprecated Use aspect + tier instead. Kept for backward compat with legacy persisted state. */
  size?: string
  aspect?: Aspect
  tier?: Tier
  n?: number
  seed?: number
}
type State = {
  prompt: string
  attachments: File[]
  params: Params
  setPrompt: (p: string) => void
  setAttachments: (a: File[]) => void
  setParams: (p: Partial<Params>) => void
  reset: () => void
}

// Only prompt + params persist; attachments (File objects) don't survive JSON roundtrip.
export const usePromptStore = create<State>()(
  persist(
    (set) => ({
      prompt: '',
      attachments: [],
      params: { aspect: '1:1', tier: 'hd' },
      setPrompt: (prompt) => set({ prompt }),
      setAttachments: (attachments) => set({ attachments }),
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      reset: () => set({ prompt: '', attachments: [], params: { aspect: '1:1', tier: 'hd' } }),
    }),
    {
      name: 'bench-prompt',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ prompt: s.prompt, params: s.params }),
      // Merge legacy persisted state: if aspect/tier missing, apply defaults
      merge: (persisted, current) => {
        const p = (persisted as Partial<State>)?.params ?? {}
        return {
          ...current,
          prompt: (persisted as Partial<State>)?.prompt ?? current.prompt,
          params: {
            aspect: '1:1' as Aspect,
            tier: 'hd' as Tier,
            ...p,
          },
        }
      },
    },
  ),
)
