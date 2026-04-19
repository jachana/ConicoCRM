import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Users from './pages/Users'
import Empresas from './pages/Empresas'
import Proveedores from './pages/Proveedores'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
import Cotizaciones from './pages/Cotizaciones'
import CotizacionDetalle from './pages/CotizacionDetalle'
import RRHH from './pages/RRHH'
import NotaVentas from './pages/NotaVentas'
import NotaVentaDetalle from './pages/NotaVentaDetalle'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <div className="p-6 text-gray-700 dark:text-gray-300">Dashboard — próximamente</div> },
      { path: 'usuarios', element: <Users /> },
      { path: 'empresas', element: <Empresas /> },
      { path: 'proveedores', element: <Proveedores /> },
      { path: 'catalogo', element: <Productos /> },
      { path: 'clientes', element: <Clientes /> },
      { path: 'cotizaciones', element: <Cotizaciones /> },
      { path: 'cotizaciones/nueva', element: <CotizacionDetalle /> },
      { path: 'cotizaciones/:id', element: <CotizacionDetalle /> },
      { path: 'notas-venta', element: <NotaVentas /> },
      { path: 'notas-venta/nueva', element: <NotaVentaDetalle /> },
      { path: 'notas-venta/:id', element: <NotaVentaDetalle /> },
      { path: 'rrhh', element: <RRHH /> },
    ],
  },
])
