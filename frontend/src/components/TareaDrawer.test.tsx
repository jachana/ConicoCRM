import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TareaDrawer from './TareaDrawer';
import type { Tarea } from '../types/tarea';

vi.mock('../api/tareas', () => ({
  completarTarea: vi.fn(),
  descartarTarea: vi.fn(),
  deleteTarea: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', name: 'Admin' } }),
}));

vi.mock('../hooks/useEffectivePermissions', () => ({
  useEffectivePermissions: () => ({ role: 'admin' }),
}));

function makeTarea(overrides: Partial<Tarea> = {}): Tarea {
  return {
    id: 1,
    titulo: 'Llamar al cliente',
    descripcion: null,
    due_date: '2026-06-15',
    estado: 'pendiente',
    motivo_descarte: null,
    origen: 'manual',
    tipo_regla: null,
    prioridad_derivada: 'futura',
    asignado_id: 1,
    asignado_nombre: 'Admin',
    creado_por_id: 1,
    cliente_id: null,
    empresa_id: null,
    cotizacion_id: null,
    nota_venta_id: null,
    factura_id: null,
    producto_id: null,
    completada_at: null,
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  };
}

function wrap(tarea: Tarea) {
  return render(
    <MemoryRouter>
      <TareaDrawer tarea={tarea} onClose={vi.fn()} onChanged={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('TareaDrawer — Vinculado a', () => {
  it('muestra link a factura cuando factura_id está seteada', () => {
    wrap(makeTarea({ factura_id: 42 }));
    expect(screen.getByText('Vinculado a')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Factura N° 42' });
    expect(link.getAttribute('href')).toBe('/facturas/42');
  });

  it('muestra link a cliente cuando cliente_id está seteada', () => {
    wrap(makeTarea({ cliente_id: 7 }));
    const link = screen.getByRole('link', { name: 'Cliente #7' });
    expect(link.getAttribute('href')).toBe('/clientes?detalle=7');
  });

  it('muestra link a nota de venta cuando nota_venta_id está seteada', () => {
    wrap(makeTarea({ nota_venta_id: 9 }));
    const link = screen.getByRole('link', { name: 'Nota de venta N° 9' });
    expect(link.getAttribute('href')).toBe('/notas-venta/9');
  });

  it('no renderiza la sección cuando ninguna FK está seteada', () => {
    wrap(makeTarea());
    expect(screen.queryByText('Vinculado a')).toBeNull();
  });
});
