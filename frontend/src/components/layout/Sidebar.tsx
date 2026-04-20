import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, ClipboardList,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from './ThemeProvider'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

const NAV = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cotizaciones',   icon: FileText,        label: 'Cotizaciones' },
  { to: '/clientes',       icon: Users,           label: 'Clientes' },
  { to: '/empresas',       icon: Building2,       label: 'Empresas' },
  { to: '/catalogo',       icon: Package,         label: 'Catálogo' },
  { to: '/notas-venta',    icon: ShoppingCart,    label: 'Notas de Venta' },
  { to: '/facturas',       icon: Receipt,         label: 'Facturas' },
  { to: '/pagos',          icon: CreditCard,      label: 'Pagos' },
  { to: '/inventario',     icon: Warehouse,       label: 'Inventario' },
  { to: '/ordenes-compra', icon: ShoppingCart,    label: 'Órdenes de Compra' },
  { to: '/proveedores',    icon: Truck,           label: 'Proveedores' },
  { to: '/rrhh',           icon: UserCog,         label: 'RRHH' },
  { to: '/usuarios',       icon: Users,           label: 'Usuarios' },
]

export default function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const { theme, toggle: toggleTheme } = useTheme()

  const { data: stockBajo = [] } = useQuery<{ id: number }[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
    enabled: !!user && user.role !== 'vendedor',
    staleTime: 60_000,
  })
  const stockBajoCount = stockBajo.length

  const isAdminUser = !!user && (user.role === 'admin' || user.role === 'subadmin')
  const { data: aprobacionesPendientes = [] } = useQuery<{ id: number }[]>({
    queryKey: ['aprobaciones-pendientes'],
    queryFn: () => api.get('/api/aprobaciones/?estado=pendiente').then(r => r.data),
    enabled: isAdminUser,
    staleTime: 30_000,
  })
  const aprobacionesCount = aprobacionesPendientes.length

  return (
    <aside
      className={`flex flex-col h-full bg-[#111827] text-gray-300 transition-all duration-200 flex-shrink-0
                  ${collapsed ? 'w-14' : 'w-64'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-white/5">
        {!collapsed && (
          <span className="font-bold text-white tracking-widest text-sm">CONICO</span>
        )}
        {onClose ? (
          <button
            aria-label="Cerrar menú"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0 text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            aria-label="toggle-sidebar"
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0 text-gray-400 hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => {
          const badge = to === '/inventario' ? stockBajoCount : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-colors
                 ${isActive
                   ? 'bg-brand-500/15 text-brand-400 font-medium'
                   : 'hover:bg-white/8 hover:text-white text-gray-400'}`
              }
              title={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  <span className="relative flex-shrink-0">
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                    {badge > 0 && collapsed && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1">{label}</span>
                      {badge > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
        {isAdminUser && (
          <NavLink
            to="/aprobaciones"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-colors
               ${isActive
                 ? 'bg-brand-500/15 text-brand-400 font-medium'
                 : 'hover:bg-white/8 hover:text-white text-gray-400'}`
            }
            title={collapsed ? 'Aprobaciones' : undefined}
          >
            {({ isActive }) => (
              <>
                <span className="relative flex-shrink-0">
                  <ClipboardList size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                  {aprobacionesCount > 0 && collapsed && (
                    <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                      {aprobacionesCount > 99 ? '99+' : aprobacionesCount}
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">Aprobaciones</span>
                    {aprobacionesCount > 0 && (
                      <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {aprobacionesCount > 99 ? '99+' : aprobacionesCount}
                      </span>
                    )}
                  </>
                )}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-2 space-y-0.5">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-white/8 hover:text-white transition-colors"
          title={collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined}
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>
        {!collapsed && user && (
          <div className="px-3 py-1 text-xs text-gray-500 truncate">{user.name}</div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-red-950/60 hover:text-red-400 transition-colors"
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={18} strokeWidth={1.8} />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
