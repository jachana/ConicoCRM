import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Clientes from './Clientes'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
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

it('muestra lista de clientes', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({
    data: [{ id: 1, nombre: 'Empresa XYZ Ltda.', rut: '76.543.210-K', email: 'contacto@xyz.cl', telefono: null, direccion: null, notas: null, created_at: '' }],
  })
  render(wrap(<Clientes />))
  await waitFor(() => expect(screen.getByText('Empresa XYZ Ltda.')).toBeInTheDocument())
  expect(screen.getByText('76.543.210-K')).toBeInTheDocument()
})

it('muestra botón Agregar cliente', async () => {
  vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] })
  render(wrap(<Clientes />))
  await waitFor(() => expect(screen.getByText('Agregar cliente')).toBeInTheDocument())
})
