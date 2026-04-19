import { jsx as _jsx } from "react/jsx-runtime";
// frontend/src/pages/Users.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, it, expect } from 'vitest';
import Users from './Users';
import * as apiModule from '../lib/api';
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
vi.mock('../stores/auth', () => ({
    useAuthStore: (fn) => fn ? fn({ user: { role: 'admin' } }) : { user: { role: 'admin' } },
}));
function wrap(ui) {
    return (_jsx(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }), children: _jsx(MemoryRouter, { children: _jsx(Routes, { children: _jsx(Route, { path: "/", element: ui }) }) }) }));
}
it('renders list of users', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
        data: [{ id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin', is_active: true, created_at: '' }],
    });
    render(wrap(_jsx(Users, {})));
    await waitFor(() => expect(screen.getByText('a@b.cl')).toBeInTheDocument());
    expect(screen.getByText('Admin')).toBeInTheDocument();
});
it('does not show Permisos button for admin users', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
        data: [{ id: 1, email: 'a@b.cl', name: 'Admin', role: 'admin', is_active: true, created_at: '' }],
    });
    render(wrap(_jsx(Users, {})));
    await waitFor(() => expect(screen.getByText('a@b.cl')).toBeInTheDocument());
    expect(screen.queryByText('Permisos')).not.toBeInTheDocument();
});
it('shows Permisos button for non-admin users', async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
        data: [{ id: 2, email: 'v@b.cl', name: 'Vendedor', role: 'vendedor', is_active: true, created_at: '' }],
    });
    render(wrap(_jsx(Users, {})));
    await waitFor(() => expect(screen.getByText('Permisos')).toBeInTheDocument());
});
