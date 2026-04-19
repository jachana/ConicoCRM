import { jsx as _jsx } from "react/jsx-runtime";
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Proveedores from './Proveedores';
import * as apiModule from '../lib/api';
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../stores/auth', () => ({
    useAuthStore: (fn) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}));
function wrap(ui) {
    return (_jsx(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }), children: _jsx(MemoryRouter, { children: _jsx(Routes, { children: _jsx(Route, { path: "/", element: ui }) }) }) }));
}
it('muestra lista de proveedores', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
        data: [{ id: 1, nombre: 'Prov Test', rut: '76.000.001-1', contacto: null, email: null, telefono: null, notas: null, created_at: '' }],
    });
    render(wrap(_jsx(Proveedores, {})));
    await waitFor(() => expect(screen.getByText('Prov Test')).toBeInTheDocument());
});
it('muestra botón Agregar proveedor', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({ data: [] });
    render(wrap(_jsx(Proveedores, {})));
    await waitFor(() => expect(screen.getByText('Agregar proveedor')).toBeInTheDocument());
});
