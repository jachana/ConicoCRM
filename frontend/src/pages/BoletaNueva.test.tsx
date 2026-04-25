import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../api/boletas', () => ({
  crearBoleta: vi.fn().mockResolvedValue({ id: 99, numero: 1, total: '1190' }),
}))

import BoletaNueva from './BoletaNueva'
import { crearBoleta } from '../api/boletas'

describe('BoletaNueva', () => {
  beforeEach(() => {
    ;(crearBoleta as unknown as ReturnType<typeof vi.fn>).mockClear()
  })

  it('emite boleta anónima con una línea', async () => {
    render(
      <MemoryRouter>
        <BoletaNueva />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByPlaceholderText(/descripción/i), { target: { value: 'Producto X' } })
    fireEvent.change(screen.getByPlaceholderText(/cantidad/i), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText(/precio/i), { target: { value: '1190' } })
    fireEvent.click(screen.getByRole('button', { name: /^emitir$/i }))
    await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
    const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.tipo_dte).toBe('39')
    expect(payload.lineas).toHaveLength(1)
    expect(payload.lineas[0].descripcion).toBe('Producto X')
  })

  it('forza exenta cuando tipo_dte es 41', async () => {
    render(
      <MemoryRouter>
        <BoletaNueva />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /41 Exenta/i }))
    fireEvent.change(screen.getByPlaceholderText(/descripción/i), { target: { value: 'Servicio exento' } })
    fireEvent.change(screen.getByPlaceholderText(/precio/i), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^emitir$/i }))
    await waitFor(() => expect(crearBoleta).toHaveBeenCalled())
    const payload = (crearBoleta as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.tipo_dte).toBe('41')
    expect(payload.lineas[0].exenta).toBe(true)
  })
})
