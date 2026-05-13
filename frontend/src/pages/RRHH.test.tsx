// frontend/src/pages/RRHH.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import RRHH from './RRHH'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const { api } = await import('../lib/api')

function wrap(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: [] })
})

describe('RRHH', () => {
  it('renderiza título', async () => {
    wrap(<RRHH />)
    expect(await screen.findByText('RRHH')).toBeTruthy()
  })

  it('muestra mensaje cuando no hay empleados', async () => {
    wrap(<RRHH />)
    expect(await screen.findByText(/sin empleados/i)).toBeTruthy()
  })

  it('muestra empleado de la lista', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 1, nombre: 'Juan Pérez', cargo: 'Gerente', sueldo_base: 1200000, fecha_ingreso: '2024-01-15', is_active: true, created_at: '2024-01-15T00:00:00Z' }],
    })
    wrap(<RRHH />)
    expect(await screen.findByText('Juan Pérez')).toBeTruthy()
    expect(await screen.findByText('Gerente')).toBeTruthy()
  })

  it('abre modal al hacer clic en Agregar empleado', async () => {
    wrap(<RRHH />)
    await screen.findByText('RRHH')
    fireEvent.click(screen.getByText(/agregar empleado/i))
    expect(screen.getByText(/nuevo empleado/i)).toBeTruthy()
  })

  it('abre modal de detalle automáticamente cuando la URL trae ?detalle=<id>', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/documentos')) return Promise.resolve({ data: [] })
      if (url.includes('/vacaciones')) return Promise.resolve({ data: [] })
      if (url.match(/\/api\/empleados\/\d+$/)) {
        return Promise.resolve({ data: { id: 5, nombre: 'Pedro Soto', cargo: 'Vendedor', sueldo_base: null, fecha_ingreso: null, is_active: true, created_at: '' } })
      }
      return Promise.resolve({ data: [] })
    })
    wrap(<RRHH />, ['/rrhh?detalle=5'])
    await waitFor(() => expect(screen.getByText('Pedro Soto')).toBeTruthy())
    expect(screen.getByText(/documentos/i)).toBeTruthy()
  })

  it('abre modal de detalle al hacer clic en un empleado', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('/documentos')) return Promise.resolve({ data: [] })
      if (url.includes('/vacaciones')) return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [{ id: 1, nombre: 'Ana García', cargo: 'CTO', sueldo_base: null, fecha_ingreso: null, is_active: true, created_at: '' }] })
    })
    wrap(<RRHH />)
    const row = await screen.findByText('Ana García')
    fireEvent.click(row)
    await waitFor(() => expect(screen.getByText(/documentos/i)).toBeTruthy())
  })
})
