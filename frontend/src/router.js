import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { createBrowserRouter, Navigate } from 'react-router-dom';
import RouteError from './pages/RouteError';
import Login from './pages/Login';
import Users from './pages/Users';
import Empresas from './pages/Empresas';
import Proveedores from './pages/Proveedores';
import Productos from './pages/Productos';
import Clientes from './pages/Clientes';
import Cotizaciones from './pages/Cotizaciones';
import CotizacionDetalle from './pages/CotizacionDetalle';
import OrdenesCompra from './pages/OrdenesCompra';
import OrdenCompraDetalle from './pages/OrdenCompraDetalle';
import RRHH from './pages/RRHH';
import Inventario from './pages/Inventario';
import NotaVentas from './pages/NotaVentas';
import NotaVentaDetalle from './pages/NotaVentaDetalle';
import Facturas from './pages/Facturas';
import FacturaDetalle from './pages/FacturaDetalle';
import Pagos from './pages/Pagos';
import Aprobaciones from './pages/Aprobaciones';
import Dashboard from './pages/Dashboard';
import { useAuthStore } from './stores/auth';
import AppLayout from './components/layout/AppLayout';
function RequireAuth({ children }) {
    const token = useAuthStore(s => s.accessToken);
    if (!token)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
}
export const router = createBrowserRouter([
    { path: '/login', element: _jsx(Login, {}), errorElement: _jsx(RouteError, {}) },
    {
        path: '/',
        element: _jsx(RequireAuth, { children: _jsx(AppLayout, {}) }),
        errorElement: _jsx(RouteError, {}),
        children: [
            { index: true, element: _jsx(Dashboard, {}) },
            { path: 'usuarios', element: _jsx(Users, {}) },
            { path: 'empresas', element: _jsx(Empresas, {}) },
            { path: 'proveedores', element: _jsx(Proveedores, {}) },
            { path: 'catalogo', element: _jsx(Productos, {}) },
            { path: 'clientes', element: _jsx(Clientes, {}) },
            { path: 'cotizaciones', element: _jsx(Cotizaciones, {}) },
            { path: 'cotizaciones/nueva', element: _jsx(CotizacionDetalle, {}) },
            { path: 'cotizaciones/:id', element: _jsx(CotizacionDetalle, {}) },
            { path: 'ordenes-compra', element: _jsx(OrdenesCompra, {}) },
            { path: 'ordenes-compra/nueva', element: _jsx(OrdenCompraDetalle, {}) },
            { path: 'ordenes-compra/:id', element: _jsx(OrdenCompraDetalle, {}) },
            { path: 'notas-venta', element: _jsx(NotaVentas, {}) },
            { path: 'notas-venta/nueva', element: _jsx(NotaVentaDetalle, {}) },
            { path: 'notas-venta/:id', element: _jsx(NotaVentaDetalle, {}) },
            { path: 'facturas', element: _jsx(Facturas, {}) },
            { path: 'facturas/nueva', element: _jsx(FacturaDetalle, {}) },
            { path: 'facturas/:id', element: _jsx(FacturaDetalle, {}) },
            { path: 'pagos', element: _jsx(Pagos, {}) },
            { path: 'aprobaciones', element: _jsx(Aprobaciones, {}) },
            { path: 'rrhh', element: _jsx(RRHH, {}) },
            { path: 'inventario', element: _jsx(Inventario, {}) },
        ],
    },
]);
