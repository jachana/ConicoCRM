import { it, expect, vi, describe, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../hooks/useModulos', () => ({
  useModulos: vi.fn(),
}))

// Stub out heavy chart/table deps so tests stay fast
vi.mock('recharts', () => ({
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Cell: () => null,
}))

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: null }) },
}))

import { useModulos } from '../hooks/useModulos'
import { api } from '../lib/api'
import Reportes from './Reportes'
import type { ReportesPorMarca } from '../types'

const mockUseModulos = useModulos as ReturnType<typeof vi.fn>
const mockApiGet = api.get as ReturnType<typeof vi.fn>

function allOn() {
  return {
    effective: {
      facturas: true,
      cobranza: true,
      inventario: true,
      ordenes_compra: true,
    } as never,
    isLoading: false,
    error: null,
  }
}

function renderAt(url = '/reportes') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Reportes />
    </MemoryRouter>,
  )
}

describe('Reportes tab filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: null })
  })

  it('shows all tabs when all modules enabled', () => {
    mockUseModulos.mockReturnValue(allOn())
    renderAt()
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Cobranza' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Inventario' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Compras' })).toBeTruthy()
  })

  it('hides Cobranza tab when cobranza module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: false, inventario: true, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    renderAt()
    expect(screen.queryByRole('tab', { name: 'Cobranza' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
  })

  it('hides Inventario tab when inventario module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: true, inventario: false, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    renderAt()
    expect(screen.queryByRole('tab', { name: 'Inventario' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Ventas' })).toBeTruthy()
  })

  it('hides Compras tab when ordenes_compra module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, cobranza: true, inventario: true, ordenes_compra: false } as never,
      isLoading: false,
      error: null,
    })
    renderAt()
    expect(screen.queryByRole('tab', { name: 'Compras' })).toBeNull()
  })

  it('hides Ventas, Márgenes, Por Marca, DTE tabs when facturas module is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: false, cobranza: true, inventario: true, ordenes_compra: true } as never,
      isLoading: false,
      error: null,
    })
    renderAt()
    expect(screen.queryByRole('tab', { name: 'Ventas' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Márgenes' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Por Marca' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'DTE' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Cobranza' })).toBeTruthy()
  })
})

// ── Deep-links (query params) ────────────────────────────────────────────────

const POR_MARCA_FIXTURE: ReportesPorMarca = {
  kpis: {
    total_neto: 1000,
    total_bruto: 1190,
    ganancia_total: 300,
    margen_promedio_pct: 30,
    num_facturas: 2,
    num_marcas: 1,
    ticket_promedio: 500,
    cantidad_total: 10,
  },
  por_marca: [
    {
      marca_id: 1,
      nombre: 'Marca Uno',
      cantidad: 10,
      neto: 1000,
      ganancia: 300,
      margen_pct: 30,
      num_facturas: 2,
      num_clientes: 1,
      ticket_promedio: 500,
    },
  ],
  por_marca_cliente: [],
  sin_marca: { cantidad: 0, neto: 0, ganancia: 0 },
}

describe('Reportes deep-links (query params)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseModulos.mockReturnValue(allOn())
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith('/api/reportes/por-marca')) {
        return Promise.resolve({ data: POR_MARCA_FIXTURE })
      }
      if (url.startsWith('/api/clientes/42')) {
        return Promise.resolve({ data: { id: 42, nombre: 'Pedro Soto' } })
      }
      if (url.startsWith('/api/clientes/')) {
        return Promise.resolve({ data: [] })
      }
      return Promise.resolve({ data: null })
    })
  })

  it('?tab=por_marca&cliente_id=42 activates Por Marca tab with cliente pre-filtered', async () => {
    renderAt('/reportes?tab=por_marca&cliente_id=42')

    expect(screen.getByRole('tab', { name: 'Por Marca' }).getAttribute('aria-selected')).toBe('true')

    await waitFor(() => {
      const call = mockApiGet.mock.calls.find(([url]) =>
        String(url).startsWith('/api/reportes/por-marca'),
      )
      expect(call).toBeTruthy()
      expect(String(call![0])).toContain('cliente_id=42')
    })

    // Selected cliente chip rendered by ClienteMultiSelect
    await waitFor(() => {
      expect(screen.getByText('Pedro Soto')).toBeTruthy()
    })
  })

  it('?date_from & ?date_to initialize custom date range', async () => {
    renderAt('/reportes?tab=por_marca&date_from=2026-01-01&date_to=2026-01-31')

    await waitFor(() => {
      const call = mockApiGet.mock.calls.find(([url]) =>
        String(url).startsWith('/api/reportes/por-marca'),
      )
      expect(call).toBeTruthy()
      expect(String(call![0])).toContain('date_from=2026-01-01')
      expect(String(call![0])).toContain('date_to=2026-01-31')
    })

    // Preset switched to "personalizado" → date inputs show URL values
    expect(screen.getByDisplayValue('2026-01-01')).toBeTruthy()
    expect(screen.getByDisplayValue('2026-01-31')).toBeTruthy()
  })

  it('invalid ?tab falls back to default (ventas)', () => {
    renderAt('/reportes?tab=no_existe')

    expect(screen.getByRole('tab', { name: 'Ventas' }).getAttribute('aria-selected')).toBe('true')
  })
})
