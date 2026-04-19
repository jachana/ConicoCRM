import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NotaVentas from './NotaVentas';
vi.mock('../lib/api', () => ({
    api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
const { api } = await import('../lib/api');
function wrap(ui) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(_jsx(QueryClientProvider, { client: qc, children: _jsx(MemoryRouter, { children: ui }) }));
}
beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
});
describe('NotaVentas', () => {
    it('renderiza título', async () => {
        wrap(_jsx(NotaVentas, {}));
        expect(await screen.findByText('Notas de Venta')).toBeTruthy();
    });
    it('muestra mensaje cuando no hay NVs', async () => {
        wrap(_jsx(NotaVentas, {}));
        expect(await screen.findByText(/sin notas de venta/i)).toBeTruthy();
    });
    it('renderiza NV de la lista', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: [{
                    id: 1, numero: 1, cotizacion_id: null,
                    cliente_id: 1, vendedor_id: null, empresa_id: null,
                    contacto: null, fecha: '2026-04-18',
                    estado: 'pendiente', nota: null, correo: null,
                    total_neto: 1000, total_iva: 190, total: 1190,
                    created_at: '2026-04-18T00:00:00Z', updated_at: '2026-04-18T00:00:00Z',
                    cliente: { id: 1, nombre: 'Empresa ABC', rut: null, email: null, telefono: null },
                }],
        });
        wrap(_jsx(NotaVentas, {}));
        expect(await screen.findByText('Empresa ABC')).toBeTruthy();
        expect(await screen.findByText('NV-00001')).toBeTruthy();
    });
    it('muestra badge de estado', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: [{
                    id: 1, numero: 1, cotizacion_id: null,
                    cliente_id: 1, vendedor_id: null, empresa_id: null,
                    contacto: null, fecha: '2026-04-18',
                    estado: 'despachada', nota: null, correo: null,
                    total_neto: 0, total_iva: 0, total: 0,
                    created_at: '2026-04-18T00:00:00Z', updated_at: '2026-04-18T00:00:00Z',
                    cliente: { id: 1, nombre: 'X', rut: null, email: null, telefono: null },
                }],
        });
        wrap(_jsx(NotaVentas, {}));
        expect(await screen.findByText('Despachada')).toBeTruthy();
    });
});
