import { create } from 'zustand'

export type ModelCard = { cardId: string; providerId: string }
type State = {
  cards: ModelCard[]
  addCard: (providerId: string) => void
  removeCard: (cardId: string) => void
  setProvider: (cardId: string, providerId: string) => void
}

export const useModelStore = create<State>((set) => ({
  cards: [],
  addCard: (providerId) => set((s) => ({ cards: [...s.cards, { cardId: crypto.randomUUID(), providerId }] })),
  removeCard: (cardId) => set((s) => ({ cards: s.cards.filter(c => c.cardId !== cardId) })),
  setProvider: (cardId, providerId) => set((s) => ({
    cards: s.cards.map(c => c.cardId === cardId ? { ...c, providerId } : c),
  })),
}))
