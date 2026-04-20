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
import NotaVentas from './pages/NotaVentas'
import NotaVentaDetalle from './pages/NotaVentaDetalle'
import Facturas from './pages/Facturas'
import FacturaDetalle from './pages/FacturaDetalle'
import Pagos from './pages/Pagos'
import Aprobaciones from './pages/Aprobaciones'
import Dashboard from './pages/Dashboard'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
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
      { path: 'usuarios', element: <Users /> },
      { path: 'empresas', element: <Empresas /> },
      { path: 'proveedores', element: <Proveedores /> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'cotizaciones', element: <Cotizaciones /> },
      { path: 'cotizaciones/nueva', element: <CotizacionDetalle /> },
      { path: 'cotizaciones/:id', element: <CotizacionDetalle /> },
      { path: 'ordenes-compra', element: <OrdenesCompra /> },
      { path: 'ordenes-compra/nueva', element: <OrdenCompraDetalle /> },
      { path: 'ordenes-compra/:id', element: <OrdenCompraDetalle /> },
      { path: 'notas-venta', element: <NotaVentas /> },
      { path: 'notas-venta/nueva', element: <NotaVentaDetalle /> },
      { path: 'notas-venta/:id', element: <NotaVentaDetalle /> },
      { path: 'facturas', element: <Facturas /> },
      { path: 'facturas/nueva', element: <FacturaDetalle /> },
      { path: 'facturas/:id', element: <FacturaDetalle /> },
      { path: 'pagos', element: <Pagos /> },
      { path: 'aprobaciones', element: <Aprobaciones /> },
      { path: 'rrhh', element: <RRHH /> },
      { path: 'inventario', element: <Inventario /> },
    ],
  },
])
