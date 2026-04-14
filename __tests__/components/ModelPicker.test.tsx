import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelPicker } from '@/components/workbench/ModelPicker'

const providers = [
  { id: 'a', displayName: 'A', capabilities: { textToImage: true, imageToImage: false, maxImages: 1, sizes: ['512x512'] } },
  { id: 'b', displayName: 'B', capabilities: { textToImage: true, imageToImage: true, maxImages: 4, sizes: ['1024x1024'] } },
]

describe('ModelPicker', () => {
  it('calls onSelect with chosen id', async () => {
    const onSelect = vi.fn()
    render(<ModelPicker providers={providers} onSelect={onSelect} trigger={<button>open</button>} />)
    await userEvent.click(screen.getByText('open'))
    await userEvent.click(screen.getByText('B'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})
