import { describe, it, expect, beforeEach } from 'vitest'
import { useModelStore } from '@/lib/store/useModelStore'
import { usePromptStore } from '@/lib/store/usePromptStore'
import { useSessionStore } from '@/lib/store/useSessionStore'

describe('useModelStore', () => {
  beforeEach(() => useModelStore.setState({ cards: [] }))
  it('adds and removes cards', () => {
    useModelStore.getState().addCard('mock')
    expect(useModelStore.getState().cards).toHaveLength(1)
    const id = useModelStore.getState().cards[0].cardId
    useModelStore.getState().removeCard(id)
    expect(useModelStore.getState().cards).toHaveLength(0)
  })
  it('swaps provider on a card', () => {
    useModelStore.getState().addCard('mock')
    const id = useModelStore.getState().cards[0].cardId
    useModelStore.getState().setProvider(id, 'other')
    expect(useModelStore.getState().cards[0].providerId).toBe('other')
  })
})

describe('usePromptStore', () => {
  beforeEach(() => usePromptStore.setState({ prompt: '', attachments: [], params: {} }))
  it('sets prompt and params', () => {
    usePromptStore.getState().setPrompt('hi')
    usePromptStore.getState().setParams({ size: '1024x1024' })
    expect(usePromptStore.getState().prompt).toBe('hi')
    expect(usePromptStore.getState().params.size).toBe('1024x1024')
  })
})

describe('useSessionStore', () => {
  beforeEach(() => useSessionStore.setState({ sessions: {} }))
  it('creates session and updates card status', () => {
    const s = useSessionStore.getState().createSession({
      prompt: 'p', params: {}, cards: [{ cardId: 'c1', providerId: 'mock' }],
    })
    useSessionStore.getState().updateCard(s.id, 'c1', { status: 'running' })
    expect(useSessionStore.getState().sessions[s.id].cards[0].status).toBe('running')
  })
})
