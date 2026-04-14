import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyManager } from '@/components/settings/KeyManager'

vi.mock('@/lib/providers/registry', () => ({
  listProviders: () => [
    { id: 'mock', displayName: 'Mock', capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] } },
  ],
}))
vi.mock('@/lib/providers', () => ({ bootstrapProviders: () => {} }))

describe('KeyManager', () => {
  beforeEach(() => localStorage.clear())
  it('persists key on save', async () => {
    render(<KeyManager />)
    const input = screen.getByLabelText(/mock/i)
    await userEvent.type(input, 'secret')
    await userEvent.click(screen.getByRole('button', { name: /save mock/i }))
    expect(localStorage.getItem('apikey:mock')).toBe('secret')
  })
})
