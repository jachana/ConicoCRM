import { it, expect, vi, describe, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useModulos', () => ({
  useModulos: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}))

import { useModulos } from '../../hooks/useModulos'
import DashboardHero from './DashboardHero'

const mockUseModulos = useModulos as ReturnType<typeof vi.fn>

function allOn() {
  return {
    effective: {
      facturas: true,
      notas_venta: true,
      inventario: true,
    } as never,
    isLoading: false,
    error: null,
  }
}

function renderHero() {
  return render(
    <MemoryRouter>
      <DashboardHero userName="Test" />
    </MemoryRouter>,
  )
}

describe('DashboardHero module gating', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows all 4 KPI tiles when all modules enabled', () => {
    mockUseModulos.mockReturnValue(allOn())
    renderHero()
    expect(screen.getByText('Ventas hoy')).toBeTruthy()
    expect(screen.getByText('Ventas mes')).toBeTruthy()
    expect(screen.getByText('Por cobrar')).toBeTruthy()
    expect(screen.getByText('Stock crítico')).toBeTruthy()
  })

  it('hides ventas tiles when facturas is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: false, notas_venta: true, inventario: true } as never,
      isLoading: false,
      error: null,
    })
    renderHero()
    expect(screen.queryByText('Ventas hoy')).toBeNull()
    expect(screen.queryByText('Ventas mes')).toBeNull()
    expect(screen.getByText('Por cobrar')).toBeTruthy()
    expect(screen.getByText('Stock crítico')).toBeTruthy()
  })

  it('hides Por cobrar tile when notas_venta is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, notas_venta: false, inventario: true } as never,
      isLoading: false,
      error: null,
    })
    renderHero()
    expect(screen.getByText('Ventas hoy')).toBeTruthy()
    expect(screen.queryByText('Por cobrar')).toBeNull()
    expect(screen.getByText('Stock crítico')).toBeTruthy()
  })

  it('hides Stock crítico tile when inventario is off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: true, notas_venta: true, inventario: false } as never,
      isLoading: false,
      error: null,
    })
    renderHero()
    expect(screen.getByText('Ventas hoy')).toBeTruthy()
    expect(screen.queryByText('Stock crítico')).toBeNull()
  })

  it('renders no KPI grid when all optional modules are off', () => {
    mockUseModulos.mockReturnValue({
      effective: { facturas: false, notas_venta: false, inventario: false } as never,
      isLoading: false,
      error: null,
    })
    renderHero()
    expect(screen.queryByText('Ventas hoy')).toBeNull()
    expect(screen.queryByText('Por cobrar')).toBeNull()
    expect(screen.queryByText('Stock crítico')).toBeNull()
  })
})
