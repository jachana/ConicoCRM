import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProveedorDetailModal from './ProveedorDetailModal'
import type { Proveedor, CompraDocItem } from '../types'

const PROVEEDOR: Proveedor = {
  id: 7,
  nombre: 'Insumos del Sur',
  rut: '76.123.456-7',
  contacto: 'María Pérez',
  email: 'ventas@insumosdelsur.cl',
  telefono: '+56 9 1234 5678',
  notas: 'Despacha los martes',
  created_at: '2026-01-01T00:00:00',
}

const OCS_FIXTURE: CompraDocItem[] = [
  { id: 21, numero: 3, fecha: '2026-05-10', estado: 'enviada', total: 350000, fecha_entrega_esperada: '2026-05-20' },
]

const FCS_FIXTURE: CompraDocItem[] = [
  { id: 55, numero: 12, fecha: '2026-05-18', estado: 'emitida', total: '119000', fecha_entrega_esperada: null },
]

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ordenes-compra')) return Promise.resolve({ data: OCS_FIXTURE })
      if (url.includes('/facturas-compra')) return Promise.resolve({ data: FCS_FIXTURE })
      return Promise.resolve({ data: [] })
    }),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProveedorDetailModal', () => {
  it('renders nothing when proveedor is null', () => {
    wrap(<ProveedorDetailModal proveedor={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders datos fields and header subtitle', () => {
    wrap(<ProveedorDetailModal proveedor={PROVEEDOR} onClose={() => {}} />)

    // Appears in the modal title and in the "Nombre" field card
    expect(screen.getAllByText('Insumos del Sur').length).toBe(2)
    expect(screen.getByText('76.123.456-7 · María Pérez · ventas@insumosdelsur.cl')).toBeTruthy()
    expect(screen.getByText('76.123.456-7')).toBeTruthy()
    expect(screen.getByText('+56 9 1234 5678')).toBeTruthy()
    expect(screen.getByText('Despacha los martes')).toBeTruthy()
  })

  it('calls onEdit with the proveedor when Editar is clicked', async () => {
    const onEdit = vi.fn()
    wrap(<ProveedorDetailModal proveedor={PROVEEDOR} onClose={() => {}} onEdit={onEdit} />)

    await userEvent.click(screen.getByRole('button', { name: /Editar/i }))
    expect(onEdit).toHaveBeenCalledWith(PROVEEDOR)
  })

  it('renders OC row with link to /ordenes-compra/<id> and entrega estimada', async () => {
    wrap(<ProveedorDetailModal proveedor={PROVEEDOR} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Órdenes de compra' }))

    const link = await screen.findByRole('link', { name: 'OC-00003' })
    expect(link.getAttribute('href')).toBe('/ordenes-compra/21')
    expect(screen.getByText('Enviada')).toBeTruthy()
    expect(screen.getByText(`$ ${(350000).toLocaleString('es-CL')}`)).toBeTruthy()
    expect(screen.getByText('1 orden de compra')).toBeTruthy()
  })

  it('renders FC row with link to /facturas-compra/<id>', async () => {
    wrap(<ProveedorDetailModal proveedor={PROVEEDOR} onClose={() => {}} />)

    await userEvent.click(screen.getByRole('tab', { name: 'Facturas de compra' }))

    const link = await screen.findByRole('link', { name: 'FC-12' })
    expect(link.getAttribute('href')).toBe('/facturas-compra/55')
    expect(screen.getByText('Emitida')).toBeTruthy()
    expect(screen.getByText(`$ ${(119000).toLocaleString('es-CL')}`)).toBeTruthy()
    expect(screen.getByText('1 factura de compra')).toBeTruthy()
  })
})
