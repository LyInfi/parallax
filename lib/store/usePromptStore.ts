import { create } from 'zustand'

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

export const usePromptStore = create<State>((set) => ({
  prompt: '', attachments: [], params: {},
  setPrompt: (prompt) => set({ prompt }),
  setAttachments: (attachments) => set({ attachments }),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  reset: () => set({ prompt: '', attachments: [], params: {} }),
}))
