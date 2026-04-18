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
    const input = screen.getByLabelText(/api key/i)
    await userEvent.type(input, 'secret')
    await userEvent.click(screen.getByRole('button', { name: /保存 mock|save mock/i }))
    // multi-field storage stores as JSON { apiKey: 'secret' }
    expect(localStorage.getItem('apikey:mock')).toBe(JSON.stringify({ apiKey: 'secret' }))
  })

  it('renders select + hint for configFields', async () => {
    // Re-mock listProviders for this test: a provider with configFields incl. select + hint
    vi.resetModules()
    vi.doMock('@/lib/providers/registry', () => ({
      listProviders: () => [{
        id: 'custom',
        displayName: 'Custom',
        capabilities: {
          textToImage: true,
          imageToImage: true,
          maxImages: 1,
          sizes: ['1024x1024'],
          configFields: [
            { id: 'baseUrl', label: 'Base URL', placeholder: 'https://x', hint: 'root /v1 URL' },
            { id: 'protocol', label: '协议', type: 'select', default: 'chat',
              options: [
                { value: 'chat', label: 'Chat' },
                { value: 'images', label: 'Images' },
              ],
            },
          ],
        },
      }],
    }))
    vi.doMock('@/lib/providers', () => ({ bootstrapProviders: () => {} }))

    const { KeyManager } = await import('@/components/settings/KeyManager')
    render(<KeyManager />)

    // select exists with two options
    const select = screen.getByLabelText('协议') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('chat')
    expect(select.querySelectorAll('option').length).toBe(2)

    // hint text rendered
    expect(screen.getByText('root /v1 URL')).toBeInTheDocument()
  })
})
