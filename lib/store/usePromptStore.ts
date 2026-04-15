import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type Params = { size?: string; n?: number; seed?: number }
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
      params: {},
      setPrompt: (prompt) => set({ prompt }),
      setAttachments: (attachments) => set({ attachments }),
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      reset: () => set({ prompt: '', attachments: [], params: {} }),
    }),
    {
      name: 'bench-prompt',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ prompt: s.prompt, params: s.params }),
    },
  ),
)
