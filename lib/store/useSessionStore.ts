import { create } from 'zustand'

export type SessionCard = {
  cardId: string
  providerId: string
  status: 'idle' | 'queued' | 'running' | 'done' | 'error'
  images: { url: string; assetId?: string }[]
  error?: { code: string; message: string }
}

export type Session = {
  id: string
  createdAt: number
  parentAssetId?: string
  prompt: string
  params: Record<string, unknown>
  cards: SessionCard[]
}

type State = {
  sessions: Record<string, Session>
  createSession: (partial: Omit<Session, 'id' | 'createdAt' | 'cards'> & { cards: Array<Pick<SessionCard, 'cardId' | 'providerId'>> }) => Session
  updateCard: (sessionId: string, cardId: string, patch: Partial<SessionCard>) => void
  appendImage: (sessionId: string, cardId: string, url: string) => void
}

export const useSessionStore = create<State>((set, get) => ({
  sessions: {},
  createSession: (p) => {
    const id = crypto.randomUUID()
    const session: Session = {
      id,
      createdAt: Date.now(),
      parentAssetId: p.parentAssetId,
      prompt: p.prompt,
      params: p.params,
      cards: p.cards.map(c => ({ cardId: c.cardId, providerId: c.providerId, status: 'idle', images: [] })),
    }
    set((s) => ({ sessions: { ...s.sessions, [id]: session } }))
    return session
  },
  updateCard: (sid, cid, patch) => set((s) => {
    const sess = s.sessions[sid]; if (!sess) return s
    return {
      sessions: {
        ...s.sessions,
        [sid]: { ...sess, cards: sess.cards.map(c => c.cardId === cid ? { ...c, ...patch } : c) },
      },
    }
  }),
  appendImage: (sid, cid, url) => {
    const sess = get().sessions[sid]; if (!sess) return
    const next = sess.cards.map(c => c.cardId === cid ? { ...c, images: [...c.images, { url }] } : c)
    set({ sessions: { ...get().sessions, [sid]: { ...sess, cards: next } } })
  },
}))
