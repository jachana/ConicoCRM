import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Receipt, Truck, UserCog, Building2, ChevronLeft, ChevronRight, LogOut, Sun, Moon
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from './ThemeProvider'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const NAV = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cotizaciones',  icon: FileText,        label: 'Cotizaciones' },
  { to: '/clientes',      icon: Users,           label: 'Clientes' },
  { to: '/empresas',      icon: Building2,       label: 'Empresas' },
  { to: '/catalogo',      icon: Package,         label: 'Catálogo' },
  { to: '/notas-venta',   icon: ShoppingCart,    label: 'Notas de Venta' },
  { to: '/facturas',      icon: Receipt,         label: 'Facturas' },
  { to: '/inventario',    icon: Warehouse,       label: 'Inventario' },
  { to: '/ordenes-compra',icon: ShoppingCart,    label: 'Órdenes de Compra' },
  { to: '/proveedores',   icon: Truck,           label: 'Proveedores' },
  { to: '/rrhh',          icon: UserCog,         label: 'RRHH' },
  { to: '/usuarios',      icon: Users,           label: 'Usuarios' },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
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

  return (
    <aside className={`flex flex-col bg-gray-900 text-gray-300 transition-all duration-200 flex-shrink-0 ${collapsed ? 'w-14' : 'w-56'}`}>
      <div className="flex items-center justify-between px-3 py-4 border-b border-gray-700">
        {!collapsed && <span className="font-bold text-white text-sm truncate">Conico PMS</span>}
        <button
          aria-label="toggle-sidebar"
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-700 transition-colors ml-auto flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ to, icon: Icon, label }) => {
          const badge = to === '/inventario' ? stockBajoCount : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 mx-1 rounded-lg text-sm transition-colors
                 ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 hover:text-white'}`
              }
              title={collapsed ? label : undefined}
            >
              <span className="relative flex-shrink-0">
                <Icon size={18} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-gray-700 p-2 space-y-1">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm hover:bg-gray-800 hover:text-white transition-colors"
          title={collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>
        {!collapsed && user && (
          <div className="px-3 py-1 text-xs text-gray-500 truncate">{user.name}</div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm hover:bg-red-900 hover:text-red-300 transition-colors"
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
