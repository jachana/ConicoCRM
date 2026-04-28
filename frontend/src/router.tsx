import { createBrowserRouter, Navigate } from 'react-router-dom'
import RouteError from './pages/RouteError'
import Login from './pages/Login'
import Users from './pages/Users'
import Empresas from './pages/Empresas'
import Proveedores from './pages/Proveedores'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
import Cotizaciones from './pages/Cotizaciones'
import CotizacionDetalle from './pages/CotizacionDetalle'
import OrdenesCompra from './pages/OrdenesCompra'
import OrdenCompraDetalle from './pages/OrdenCompraDetalle'
import RRHH from './pages/RRHH'
import Inventario from './pages/Inventario'
import ListasPrecios from './pages/ListasPrecios'
import NotaVentas from './pages/NotaVentas'
import NotaVentaDetalle from './pages/NotaVentaDetalle'
import FacturaDetalle from './pages/FacturaDetalle'
import Facturas from './pages/Facturas'
import Pagos from './pages/Pagos'
import Aprobaciones from './pages/Aprobaciones'
import Dashboard from './pages/Dashboard'
import Configuracion from './pages/Configuracion'
import Cobranza from './pages/Cobranza'
import Reportes from './pages/Reportes'
import NotasCredito from './pages/NotasCredito'
import NotaCreditoDetalle from './pages/NotaCreditoDetalle'
import NotaCreditoNueva from './pages/NotaCreditoNueva'
import BoletaNueva from './pages/BoletaNueva'
import BoletaDetalle from './pages/BoletaDetalle'
import BoletasList from './pages/BoletasList'
import GuiasDespachoList from './pages/GuiasDespachoList'
import GuiaDespachoNueva from './pages/GuiaDespachoNueva'
import GuiaDespachoDetalle from './pages/GuiaDespachoDetalle'
import NotasDebito from './pages/NotasDebito'
import NotaDebitoDetalle from './pages/NotaDebitoDetalle'
import NotaDebitoNueva from './pages/NotaDebitoNueva'
import TareasPage from './pages/Tareas'
import TareasConfigPage from './pages/TareasConfig'
import AdminAuditoria from './pages/AdminAuditoria'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

// admin + subadmin only (blocks vendedor)
function RequireNotVendedor({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (user?.role === 'vendedor') return <Navigate to="/" replace />
  return <>{children}</>
}

// admin only
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'usuarios', element: <RequireAdmin><Users /></RequireAdmin> },
      { path: 'configuracion', element: <RequireAdmin><Configuracion /></RequireAdmin> },
      { path: 'empresas', element: <Empresas /> },
      { path: 'proveedores', element: <RequireNotVendedor><Proveedores /></RequireNotVendedor> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'cotizaciones', element: <Cotizaciones /> },
      { path: 'cotizaciones/nueva', element: <CotizacionDetalle /> },
      { path: 'cotizaciones/:id', element: <CotizacionDetalle /> },
      { path: 'ordenes-compra', element: <RequireNotVendedor><OrdenesCompra /></RequireNotVendedor> },
      { path: 'ordenes-compra/nueva', element: <RequireNotVendedor><OrdenCompraDetalle /></RequireNotVendedor> },
      { path: 'ordenes-compra/:id', element: <RequireNotVendedor><OrdenCompraDetalle /></RequireNotVendedor> },
      { path: 'notas-venta', element: <NotaVentas /> },
      { path: 'notas-venta/nueva', element: <NotaVentaDetalle /> },
      { path: 'notas-venta/:id', element: <NotaVentaDetalle /> },
      { path: 'facturas', element: <Facturas /> },
      { path: 'facturas/nueva', element: <FacturaDetalle /> },
      { path: 'facturas/:id', element: <FacturaDetalle /> },
      { path: 'boletas', element: <BoletasList /> },
      { path: 'boletas/nueva', element: <BoletaNueva /> },
      { path: 'boletas/:id', element: <BoletaDetalle /> },
      { path: 'guias-despacho', element: <GuiasDespachoList /> },
      { path: 'guias-despacho/nueva', element: <GuiaDespachoNueva /> },
      { path: 'guias-despacho/:id', element: <GuiaDespachoDetalle /> },
      { path: 'notas-credito', element: <RequireNotVendedor><NotasCredito /></RequireNotVendedor> },
      { path: 'notas-credito/nueva', element: <RequireNotVendedor><NotaCreditoNueva /></RequireNotVendedor> },
      { path: 'notas-credito/:id', element: <RequireNotVendedor><NotaCreditoDetalle /></RequireNotVendedor> },
      { path: 'notas-debito', element: <RequireNotVendedor><NotasDebito /></RequireNotVendedor> },
      { path: 'notas-debito/nueva', element: <RequireNotVendedor><NotaDebitoNueva /></RequireNotVendedor> },
      { path: 'notas-debito/:id', element: <RequireNotVendedor><NotaDebitoDetalle /></RequireNotVendedor> },
      { path: 'pagos', element: <RequireNotVendedor><Pagos /></RequireNotVendedor> },
      { path: 'aprobaciones', element: <RequireNotVendedor><Aprobaciones /></RequireNotVendedor> },
      { path: 'rrhh', element: <RequireAdmin><RRHH /></RequireAdmin> },
      { path: 'inventario', element: <RequireNotVendedor><Inventario /></RequireNotVendedor> },
      { path: 'inventario/listas-precios', element: <RequireNotVendedor><ListasPrecios /></RequireNotVendedor> },
      { path: 'cobranza', element: <RequireNotVendedor><Cobranza /></RequireNotVendedor> },
      { path: 'reportes', element: <RequireNotVendedor><Reportes /></RequireNotVendedor> },
      { path: 'tareas', element: <TareasPage /> },
      { path: 'admin/tareas/config', element: <RequireAdmin><TareasConfigPage /></RequireAdmin> },
      { path: 'admin/auditoria', element: <RequireAdmin><AdminAuditoria /></RequireAdmin> },
    ],
  },
])
