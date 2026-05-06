import { createBrowserRouter, Navigate } from 'react-router-dom'
import RouteError from './pages/RouteError'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
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
import DTERecepcionList from './pages/DTERecepcionList'
import LibrosList from './pages/LibrosList'
import LibroDetalle from './pages/LibroDetalle'
import GuiasDespachoList from './pages/GuiasDespachoList'
import GuiaDespachoNueva from './pages/GuiaDespachoNueva'
import GuiaDespachoDetalle from './pages/GuiaDespachoDetalle'
import NotasDebito from './pages/NotasDebito'
import NotaDebitoDetalle from './pages/NotaDebitoDetalle'
import NotaDebitoNueva from './pages/NotaDebitoNueva'
import FacturasCompraList from './pages/FacturasCompraList'
import FacturaCompraDetalle from './pages/FacturaCompraDetalle'
import TareasPage from './pages/Tareas'
import TareasConfigPage from './pages/TareasConfig'
import AdminAuditoria from './pages/AdminAuditoria'
import AdminTelemetria from './pages/AdminTelemetria'
import MigracionInicial from './pages/MigracionInicial'
import Pipeline from './pages/Pipeline'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'
import { ModuloGuard } from './components/ModuloGuard'

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
  { path: '/forgot-password', element: <ForgotPassword />, errorElement: <RouteError /> },
  { path: '/reset-password/:token', element: <ResetPassword />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'usuarios', element: <RequireAdmin><Users /></RequireAdmin> },
      { path: 'configuracion', element: <RequireAdmin><Configuracion /></RequireAdmin> },
      { path: 'empresas', element: <Empresas /> },
      { path: 'proveedores', element: <ModuloGuard slug="proveedores"><RequireNotVendedor><Proveedores /></RequireNotVendedor></ModuloGuard> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'pipeline', element: <ModuloGuard slug="oportunidades"><Pipeline /></ModuloGuard> },
      { path: 'cotizaciones', element: <ModuloGuard slug="cotizaciones"><Cotizaciones /></ModuloGuard> },
      { path: 'cotizaciones/nueva', element: <ModuloGuard slug="cotizaciones"><CotizacionDetalle /></ModuloGuard> },
      { path: 'cotizaciones/:id', element: <ModuloGuard slug="cotizaciones"><CotizacionDetalle /></ModuloGuard> },
      { path: 'ordenes-compra', element: <ModuloGuard slug="ordenes_compra"><RequireNotVendedor><OrdenesCompra /></RequireNotVendedor></ModuloGuard> },
      { path: 'ordenes-compra/nueva', element: <ModuloGuard slug="ordenes_compra"><RequireNotVendedor><OrdenCompraDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'ordenes-compra/:id', element: <ModuloGuard slug="ordenes_compra"><RequireNotVendedor><OrdenCompraDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'facturas-compra', element: <ModuloGuard slug="facturas_compra"><RequireNotVendedor><FacturasCompraList /></RequireNotVendedor></ModuloGuard> },
      { path: 'facturas-compra/nueva', element: <ModuloGuard slug="facturas_compra"><RequireNotVendedor><FacturaCompraDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'facturas-compra/:id', element: <ModuloGuard slug="facturas_compra"><RequireNotVendedor><FacturaCompraDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-venta', element: <ModuloGuard slug="notas_venta"><NotaVentas /></ModuloGuard> },
      { path: 'notas-venta/nueva', element: <ModuloGuard slug="notas_venta"><NotaVentaDetalle /></ModuloGuard> },
      { path: 'notas-venta/:id', element: <ModuloGuard slug="notas_venta"><NotaVentaDetalle /></ModuloGuard> },
      { path: 'facturas', element: <ModuloGuard slug="facturas"><Facturas /></ModuloGuard> },
      { path: 'facturas/nueva', element: <ModuloGuard slug="facturas"><FacturaDetalle /></ModuloGuard> },
      { path: 'facturas/:id', element: <ModuloGuard slug="facturas"><FacturaDetalle /></ModuloGuard> },
      { path: 'boletas', element: <ModuloGuard slug="boletas"><BoletasList /></ModuloGuard> },
      { path: 'boletas/nueva', element: <ModuloGuard slug="boletas"><BoletaNueva /></ModuloGuard> },
      { path: 'boletas/:id', element: <ModuloGuard slug="boletas"><BoletaDetalle /></ModuloGuard> },
      { path: 'dte-recepcion', element: <ModuloGuard slug="dte_recepcion"><DTERecepcionList /></ModuloGuard> },
      { path: 'libros', element: <ModuloGuard slug="libros"><LibrosList /></ModuloGuard> },
      { path: 'libros/:tipo/:id', element: <ModuloGuard slug="libros"><LibroDetalle /></ModuloGuard> },
      { path: 'guias-despacho', element: <ModuloGuard slug="guias_despacho"><GuiasDespachoList /></ModuloGuard> },
      { path: 'guias-despacho/nueva', element: <ModuloGuard slug="guias_despacho"><GuiaDespachoNueva /></ModuloGuard> },
      { path: 'guias-despacho/:id', element: <ModuloGuard slug="guias_despacho"><GuiaDespachoDetalle /></ModuloGuard> },
      { path: 'notas-credito', element: <ModuloGuard slug="nota_credito"><RequireNotVendedor><NotasCredito /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-credito/nueva', element: <ModuloGuard slug="nota_credito"><RequireNotVendedor><NotaCreditoNueva /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-credito/:id', element: <ModuloGuard slug="nota_credito"><RequireNotVendedor><NotaCreditoDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-debito', element: <ModuloGuard slug="nota_debito"><RequireNotVendedor><NotasDebito /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-debito/nueva', element: <ModuloGuard slug="nota_debito"><RequireNotVendedor><NotaDebitoNueva /></RequireNotVendedor></ModuloGuard> },
      { path: 'notas-debito/:id', element: <ModuloGuard slug="nota_debito"><RequireNotVendedor><NotaDebitoDetalle /></RequireNotVendedor></ModuloGuard> },
      { path: 'pagos', element: <ModuloGuard slug="pagos"><RequireNotVendedor><Pagos /></RequireNotVendedor></ModuloGuard> },
      { path: 'aprobaciones', element: <ModuloGuard slug="aprobaciones_descuento"><RequireNotVendedor><Aprobaciones /></RequireNotVendedor></ModuloGuard> },
      { path: 'rrhh', element: <ModuloGuard slug="rrhh_empleados"><RequireAdmin><RRHH /></RequireAdmin></ModuloGuard> },
      { path: 'inventario', element: <ModuloGuard slug="inventario"><RequireNotVendedor><Inventario /></RequireNotVendedor></ModuloGuard> },
      { path: 'inventario/listas-precios', element: <ModuloGuard slug="listas_precios"><RequireNotVendedor><ListasPrecios /></RequireNotVendedor></ModuloGuard> },
      { path: 'cobranza', element: <ModuloGuard slug="cobranza"><RequireNotVendedor><Cobranza /></RequireNotVendedor></ModuloGuard> },
      { path: 'reportes', element: <RequireNotVendedor><Reportes /></RequireNotVendedor> },
      { path: 'tareas', element: <ModuloGuard slug="tareas"><TareasPage /></ModuloGuard> },
      { path: 'admin/tareas/config', element: <RequireAdmin><TareasConfigPage /></RequireAdmin> },
      { path: 'admin/auditoria', element: <RequireAdmin><AdminAuditoria /></RequireAdmin> },
      { path: 'admin/telemetria', element: <RequireAdmin><AdminTelemetria /></RequireAdmin> },
      { path: 'admin/migracion', element: <RequireAdmin><MigracionInicial /></RequireAdmin> },
    ],
  },
])
