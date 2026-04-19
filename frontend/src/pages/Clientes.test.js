import { jsx as _jsx } from "react/jsx-runtime";
import { it, expect, vi, describe } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Clientes from './Clientes';
import * as apiModule from '../lib/api';
import { api } from '../lib/api';
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../stores/auth', () => ({
    useAuthStore: (fn) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}));
function wrap(ui) {
    return render(_jsx(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }), children: _jsx(MemoryRouter, { children: _jsx(Routes, { children: _jsx(Route, { path: "/", element: ui }) }) }) }));
}
describe('Clientes', () => {
    it('muestra lista de clientes', async () => {
        vi.mocked(apiModule.api.get).mockResolvedValue({
            data: [{ id: 1, nombre: 'Empresa XYZ Ltda.', rut: '76.543.210-K', email: 'contacto@xyz.cl', telefono: null, direccion_despacho: null, notas: null, empresa_id: null, empresa: null, recibe_correo: true, forma_pago: null, despacho_o_retiro: null, comuna: null, ultimo_contacto: null, forma_captacion: null, compromiso: null, es_nuevo: false, created_at: '' }],
        });
        wrap(_jsx(Clientes, {}));
        await waitFor(() => expect(screen.getByText('Empresa XYZ Ltda.')).toBeInTheDocument());
        expect(screen.getByText('76.543.210-K')).toBeInTheDocument();
    });
    it('muestra botón Agregar cliente', async () => {
        vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] });
        wrap(_jsx(Clientes, {}));
        await waitFor(() => expect(screen.getByText('Agregar cliente')).toBeInTheDocument());
    });
    it('muestra columna Empresa en tabla', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: [{
                    id: 1, nombre: 'Juan Pérez', rut: null, email: null, telefono: null,
                    direccion_despacho: null, notas: null, empresa_id: 1,
                    empresa: { id: 1, nombre: 'Constructora ABC', razon_social: null, rut: null },
                    recibe_correo: true, forma_pago: null, despacho_o_retiro: null, comuna: null,
                    ultimo_contacto: null, forma_captacion: null, compromiso: null, es_nuevo: false, created_at: '2026-01-01T00:00:00Z',
                }],
        });
        wrap(_jsx(Clientes, {}));
        expect(await screen.findByText('Constructora ABC')).toBeTruthy();
    });
    it('muestra dropdown empresa en modal', async () => {
        vi.mocked(api.get).mockImplementation((url) => {
            if (url.includes('/api/empresas/'))
                return Promise.resolve({ data: [{ id: 1, nombre: 'Emp X', razon_social: null, rut: null }] });
            return Promise.resolve({ data: [] });
        });
        wrap(_jsx(Clientes, {}));
        await screen.findByText('Clientes');
        fireEvent.click(screen.getByText(/agregar cliente/i));
        const matches = await screen.findAllByText(/empresa/i);
        expect(matches.length).toBeGreaterThan(0);
    });
});
