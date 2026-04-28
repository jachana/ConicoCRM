// frontend/src/pages/Users.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, it, expect } from 'vitest'
import Users from './Users'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))
vi.mock('../stores/auth', () => ({
  useAuthStore: (fn?: any) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}))

function wrap(ui: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Routes><Route path="/" element={ui} /></Routes></MemoryRouter>
    </QueryClientProvider>
  )
}

it('renders list of users', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin', is_active: true, created_at: '' }],
  })
  render(wrap(<Users />))
  await waitFor(() => expect(screen.getByText('a@b.cl')).toBeInTheDocument())
  expect(screen.getByText('Admin')).toBeInTheDocument()
})

it('does not show Permisos button for admin users', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin', is_active: true, created_at: '' }],
  })
  render(wrap(<Users />))
  await waitFor(() => expect(screen.getByText('a@b.cl')).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /permisos/i })).not.toBeInTheDocument()
})

it('shows Permisos button for non-admin users', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 2, email: 'v@b.cl', name: 'Vendedor', role: 'vendedor', is_active: true, created_at: '' }],
  })
  render(wrap(<Users />))
  await waitFor(() => expect(screen.getByRole('button', { name: /permisos/i })).toBeInTheDocument())
})
