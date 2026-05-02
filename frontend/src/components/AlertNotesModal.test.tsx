import { it, expect, vi, describe } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlertNotesModal from './AlertNotesModal'
import type { NotaAlerta } from '../types'

const notes: NotaAlerta[] = [
  {
    id: 1,
    cotizacion_id: 10,
    contenido: 'Cliente tiene deuda pendiente',
    tipo: 'cobranza',
    monto: 150000,
    estado: 'pendiente',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 2,
    cotizacion_id: 10,
    contenido: 'Crédito bloqueado por mora',
    tipo: 'crédito',
    monto: null,
    estado: 'pendiente',
    created_at: '2026-05-01T11:00:00Z',
    updated_at: '2026-05-01T11:00:00Z',
  },
]

describe('AlertNotesModal', () => {
  it('renders notes when open', () => {
    render(<AlertNotesModal isOpen notes={notes} onClose={vi.fn()} />)
    expect(screen.getByText('Cliente tiene deuda pendiente')).toBeInTheDocument()
    expect(screen.getByText('Crédito bloqueado por mora')).toBeInTheDocument()
  })

  it('shows tipo labels', () => {
    render(<AlertNotesModal isOpen notes={notes} onClose={vi.fn()} />)
    expect(screen.getByText('Cobranza')).toBeInTheDocument()
    expect(screen.getByText('Crédito')).toBeInTheDocument()
  })

  it('shows monto when present', () => {
    render(<AlertNotesModal isOpen notes={notes} onClose={vi.fn()} />)
    expect(screen.getByText(/150\.000/)).toBeInTheDocument()
  })

  it('calls onClose when button clicked', async () => {
    const onClose = vi.fn()
    render(<AlertNotesModal isOpen notes={notes} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /Entendido/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when closed', () => {
    render(<AlertNotesModal isOpen={false} notes={notes} onClose={vi.fn()} />)
    expect(screen.queryByText('Cliente tiene deuda pendiente')).not.toBeInTheDocument()
  })

  it('shows singular message for one note', () => {
    render(<AlertNotesModal isOpen notes={[notes[0]]} onClose={vi.fn()} />)
    expect(screen.getByText(/1 alerta activa/)).toBeInTheDocument()
  })

  it('shows plural message for multiple notes', () => {
    render(<AlertNotesModal isOpen notes={notes} onClose={vi.fn()} />)
    expect(screen.getByText(/2 alertas activas/)).toBeInTheDocument()
  })
})
