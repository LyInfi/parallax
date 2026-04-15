import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PromptBar } from '@/components/workbench/PromptBar'

describe('PromptBar', () => {
  it('disables generate when prompt empty', () => {
    render(<PromptBar onGenerate={() => {}} />)
    expect(screen.getByRole('button', { name: /生成|generate/i })).toBeDisabled()
  })
  it('calls onGenerate with current prompt', async () => {
    const onGen = vi.fn()
    render(<PromptBar onGenerate={onGen} />)
    await userEvent.type(screen.getByPlaceholderText(/describe/i), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /生成|generate/i }))
    expect(onGen).toHaveBeenCalled()
  })
})
