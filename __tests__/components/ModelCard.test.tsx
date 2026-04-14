import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelCard } from '@/components/workbench/ModelCard'

describe('ModelCard', () => {
  it('renders idle state', () => {
    render(<ModelCard card={{ cardId: 'c1', providerId: 'mock', status: 'idle', images: [] }} providerName="Mock" />)
    expect(screen.getByText('Mock')).toBeInTheDocument()
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
  })
  it('renders error with retry button', () => {
    render(<ModelCard
      card={{ cardId: 'c1', providerId: 'mock', status: 'error', images: [], error: { code: 'X', message: 'oops' } }}
      providerName="Mock"
      onRetry={() => {}}
    />)
    expect(screen.getByText('oops')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
  it('renders image when done', () => {
    render(<ModelCard card={{ cardId: 'c1', providerId: 'mock', status: 'done', images: [{ url: 'data:x' }] }} providerName="Mock" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'data:x')
  })
})
