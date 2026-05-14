import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VendedorSelect from './VendedorSelect'

const getMock = vi.fn()

vi.mock('../lib/api', () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const USERS = [
  { id: 1, name: 'Admin Uno', role: 'admin', is_active: true },
  { id: 2, name: 'Vendedor Dos', role: 'vendedor', is_active: true },
  { id: 3, name: 'Vendedor Inactivo', role: 'vendedor', is_active: false },
]

describe('VendedorSelect', () => {
  it('renders enabled trigger for admin and exposes vendedor options', async () => {
    getMock.mockResolvedValueOnce({ data: USERS })

    wrap(<VendedorSelect value={null} onChange={() => {}} />)

    await waitFor(() => {
      const trigger = screen.getByRole('combobox')
      expect(trigger).not.toBeDisabled()
    })
  })

  it('renders disabled trigger when disabled prop set (vendedor role)', async () => {
    getMock.mockResolvedValueOnce({ data: USERS })

    wrap(<VendedorSelect value={2} onChange={() => {}} disabled />)

    await waitFor(() => {
      const trigger = screen.getByRole('combobox')
      expect(trigger).toBeDisabled()
    })
  })

  it('queries /api/users to fetch vendedores', async () => {
    getMock.mockResolvedValueOnce({ data: USERS })

    wrap(<VendedorSelect value={null} onChange={() => {}} />)

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/api/users')
    })
  })
})
