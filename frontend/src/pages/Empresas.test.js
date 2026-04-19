import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Empresas from './Empresas';
vi.mock('../lib/api', () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
}));
const { api } = await import('../lib/api');
function wrap(ui) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(_jsx(QueryClientProvider, { client: qc, children: ui }));
}
beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
});
describe('Empresas', () => {
    it('renderiza título', async () => {
        wrap(_jsx(Empresas, {}));
        expect(await screen.findByText('Empresas')).toBeTruthy();
    });
    it('muestra mensaje cuando no hay empresas', async () => {
        wrap(_jsx(Empresas, {}));
        expect(await screen.findByText(/sin empresas/i)).toBeTruthy();
    });
    it('renderiza empresa de la lista', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: [{ id: 1, nombre: 'Constructora ABC', rut: '76.111.111-1', razon_social: null, forma_pago: null, prioridad: null, sector: null, email: null, nota_cobranza: null, ubicacion: null, created_at: '2026-01-01T00:00:00Z' }],
        });
        wrap(_jsx(Empresas, {}));
        expect(await screen.findByText('Constructora ABC')).toBeTruthy();
    });
    it('abre modal al hacer clic en Agregar', async () => {
        wrap(_jsx(Empresas, {}));
        await screen.findByText('Empresas');
        fireEvent.click(screen.getByText(/agregar empresa/i));
        expect(screen.getByText(/nueva empresa/i)).toBeTruthy();
    });
});
