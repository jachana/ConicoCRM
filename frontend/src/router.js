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
import ListasPrecios from './pages/ListasPrecios';
import NotaVentas from './pages/NotaVentas';
import NotaVentaDetalle from './pages/NotaVentaDetalle';
import FacturaDetalle from './pages/FacturaDetalle';
import Facturas from './pages/Facturas';
import Pagos from './pages/Pagos';
import Aprobaciones from './pages/Aprobaciones';
import Dashboard from './pages/Dashboard';
import Configuracion from './pages/Configuracion';
import Cobranza from './pages/Cobranza';
import Reportes from './pages/Reportes';
import NotasCredito from './pages/NotasCredito';
import NotaCreditoDetalle from './pages/NotaCreditoDetalle';
import NotaCreditoNueva from './pages/NotaCreditoNueva';
import BoletaNueva from './pages/BoletaNueva';
import BoletaDetalle from './pages/BoletaDetalle';
import BoletasList from './pages/BoletasList';
import GuiasDespachoList from './pages/GuiasDespachoList';
import GuiaDespachoNueva from './pages/GuiaDespachoNueva';
import GuiaDespachoDetalle from './pages/GuiaDespachoDetalle';
import NotasDebito from './pages/NotasDebito';
import NotaDebitoDetalle from './pages/NotaDebitoDetalle';
import NotaDebitoNueva from './pages/NotaDebitoNueva';
import TareasPage from './pages/Tareas';
import TareasConfigPage from './pages/TareasConfig';
import AdminAuditoria from './pages/AdminAuditoria';
import { useAuthStore } from './stores/auth';
import AppLayout from './components/layout/AppLayout';
function RequireAuth({ children }) {
    const token = useAuthStore(s => s.accessToken);
    if (!token)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
}
// admin + subadmin only (blocks vendedor)
function RequireNotVendedor({ children }) {
    const user = useAuthStore(s => s.user);
    if (user?.role === 'vendedor')
        return _jsx(Navigate, { to: "/", replace: true });
    return _jsx(_Fragment, { children: children });
}
// admin only
function RequireAdmin({ children }) {
    const user = useAuthStore(s => s.user);
    if (user?.role !== 'admin')
        return _jsx(Navigate, { to: "/", replace: true });
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
            { path: 'usuarios', element: _jsx(RequireAdmin, { children: _jsx(Users, {}) }) },
            { path: 'configuracion', element: _jsx(RequireAdmin, { children: _jsx(Configuracion, {}) }) },
            { path: 'empresas', element: _jsx(Empresas, {}) },
            { path: 'proveedores', element: _jsx(RequireNotVendedor, { children: _jsx(Proveedores, {}) }) },
            { path: 'catalogo', element: _jsx(Productos, {}) },
            { path: 'clientes', element: _jsx(Clientes, {}) },
            { path: 'cotizaciones', element: _jsx(Cotizaciones, {}) },
            { path: 'cotizaciones/nueva', element: _jsx(CotizacionDetalle, {}) },
            { path: 'cotizaciones/:id', element: _jsx(CotizacionDetalle, {}) },
            { path: 'ordenes-compra', element: _jsx(RequireNotVendedor, { children: _jsx(OrdenesCompra, {}) }) },
            { path: 'ordenes-compra/nueva', element: _jsx(RequireNotVendedor, { children: _jsx(OrdenCompraDetalle, {}) }) },
            { path: 'ordenes-compra/:id', element: _jsx(RequireNotVendedor, { children: _jsx(OrdenCompraDetalle, {}) }) },
            { path: 'notas-venta', element: _jsx(NotaVentas, {}) },
            { path: 'notas-venta/nueva', element: _jsx(NotaVentaDetalle, {}) },
            { path: 'notas-venta/:id', element: _jsx(NotaVentaDetalle, {}) },
            { path: 'facturas', element: _jsx(Facturas, {}) },
            { path: 'facturas/nueva', element: _jsx(FacturaDetalle, {}) },
            { path: 'facturas/:id', element: _jsx(FacturaDetalle, {}) },
            { path: 'boletas', element: _jsx(BoletasList, {}) },
            { path: 'boletas/nueva', element: _jsx(BoletaNueva, {}) },
            { path: 'boletas/:id', element: _jsx(BoletaDetalle, {}) },
            { path: 'guias-despacho', element: _jsx(GuiasDespachoList, {}) },
            { path: 'guias-despacho/nueva', element: _jsx(GuiaDespachoNueva, {}) },
            { path: 'guias-despacho/:id', element: _jsx(GuiaDespachoDetalle, {}) },
            { path: 'notas-credito', element: _jsx(RequireNotVendedor, { children: _jsx(NotasCredito, {}) }) },
            { path: 'notas-credito/nueva', element: _jsx(RequireNotVendedor, { children: _jsx(NotaCreditoNueva, {}) }) },
            { path: 'notas-credito/:id', element: _jsx(RequireNotVendedor, { children: _jsx(NotaCreditoDetalle, {}) }) },
            { path: 'notas-debito', element: _jsx(RequireNotVendedor, { children: _jsx(NotasDebito, {}) }) },
            { path: 'notas-debito/nueva', element: _jsx(RequireNotVendedor, { children: _jsx(NotaDebitoNueva, {}) }) },
            { path: 'notas-debito/:id', element: _jsx(RequireNotVendedor, { children: _jsx(NotaDebitoDetalle, {}) }) },
            { path: 'pagos', element: _jsx(RequireNotVendedor, { children: _jsx(Pagos, {}) }) },
            { path: 'aprobaciones', element: _jsx(RequireNotVendedor, { children: _jsx(Aprobaciones, {}) }) },
            { path: 'rrhh', element: _jsx(RequireAdmin, { children: _jsx(RRHH, {}) }) },
            { path: 'inventario', element: _jsx(RequireNotVendedor, { children: _jsx(Inventario, {}) }) },
            { path: 'inventario/listas-precios', element: _jsx(RequireNotVendedor, { children: _jsx(ListasPrecios, {}) }) },
            { path: 'cobranza', element: _jsx(RequireNotVendedor, { children: _jsx(Cobranza, {}) }) },
            { path: 'reportes', element: _jsx(RequireNotVendedor, { children: _jsx(Reportes, {}) }) },
            { path: 'tareas', element: _jsx(TareasPage, {}) },
            { path: 'admin/tareas/config', element: _jsx(RequireAdmin, { children: _jsx(TareasConfigPage, {}) }) },
            { path: 'admin/auditoria', element: _jsx(RequireAdmin, { children: _jsx(AdminAuditoria, {}) }) },
        ],
    },
]);
