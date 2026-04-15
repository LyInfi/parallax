import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ModelCard = { cardId: string; providerId: string }
type State = {
  cards: ModelCard[]
  addCard: (providerId: string) => void
  removeCard: (cardId: string) => void
  setProvider: (cardId: string, providerId: string) => void
  clear: () => void
}

export const useModelStore = create<State>()(
  persist(
    (set) => ({
      cards: [],
      addCard: (providerId) =>
        set((s) => ({ cards: [...s.cards, { cardId: crypto.randomUUID(), providerId }] })),
      removeCard: (cardId) =>
        set((s) => ({ cards: s.cards.filter((c) => c.cardId !== cardId) })),
      setProvider: (cardId, providerId) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.cardId === cardId ? { ...c, providerId } : c)),
        })),
      clear: () => set({ cards: [] }),
    }),
    {
      name: 'bench-cards',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
