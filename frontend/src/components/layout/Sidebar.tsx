import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, ChevronDown, LogOut, Sun, Moon, X, ClipboardList, Settings, Banknote, BarChart2,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from './ThemeProvider'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Module, Permissions } from '../../types'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

interface NavChild { to: string; icon: React.ElementType; label: string }
interface NavItem {
  to?: string
  icon: React.ElementType
  label: string
  module?: Module
  adminOnly?: boolean
  pending?: boolean
  children?: NavChild[]
}

const NAV: NavItem[] = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard',         module: 'dashboard',  pending: true },
  { to: '/aprobaciones',   icon: ClipboardList,   label: 'Aprobaciones',      adminOnly: true },
  { to: '/clientes',       icon: Users,           label: 'Clientes',          module: 'clientes' },
  { to: '/empresas',       icon: Building2,       label: 'Empresas',          module: 'empresas' },
  { to: '/catalogo',       icon: Package,         label: 'Catálogo',          module: 'catalogo' },
  { to: '/inventario',     icon: Warehouse,       label: 'Inventario',        module: 'inventario' },
  { to: '/inventario/listas-precios', icon: FileText,  label: 'Listas de precios', adminOnly: true },
  { to: '/cotizaciones',   icon: FileText,        label: 'Cotizaciones',      module: 'cotizaciones' },
  { to: '/notas-venta',    icon: ShoppingCart,    label: 'Notas de Venta',    module: 'nota_venta' },
  {
    icon: Banknote, label: 'Cobranza',
    children: [
      { to: '/cobranza',       icon: Banknote,    label: 'Cobranza' },
      { to: '/facturas',       icon: FileText,    label: 'Facturas' },
      { to: '/notas-credito',  icon: FileText,    label: 'Notas de Crédito' },
      { to: '/notas-debito',   icon: FileText,    label: 'Notas de Débito' },
      { to: '/pagos',          icon: CreditCard,  label: 'Pagos' },
    ],
  },
  {
    icon: Truck, label: 'Compras', pending: true,
    children: [
      { to: '/ordenes-compra', icon: ShoppingCart, label: 'Órdenes de Compra' },
      { to: '/proveedores',    icon: Truck,        label: 'Proveedores' },
    ],
  },
  { to: '/rrhh',           icon: UserCog,         label: 'RRHH',              module: 'rrhh',       pending: true },
  { to: '/reportes',       icon: BarChart2,       label: 'Reportes' },
  { to: '/usuarios',       icon: Users,           label: 'Usuarios',          module: 'usuarios' },
  { to: '/configuracion',  icon: Settings,        label: 'Configuración',     adminOnly: true },
]

export default function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const { theme, toggle: toggleTheme } = useTheme()
  const location = useLocation()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    Cobranza: ['/cobranza', '/facturas', '/notas-credito', '/notas-debito', '/pagos'].some(p => location.pathname.startsWith(p)),
    Compras:  ['/ordenes-compra', '/proveedores'].some(p => location.pathname.startsWith(p)),
  }))

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const { data: stockBajo = [] } = useQuery<{ id: number }[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
    enabled: !!user && user.role !== 'vendedor',
    staleTime: 60_000,
  })
  const stockBajoCount = stockBajo.length

  const isAdminUser = !!user && (user.role === 'admin' || user.role === 'subadmin')

  const { data: myPermissions } = useQuery<Permissions>({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/api/users/me/permissions').then(r => r.data),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })

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
        {NAV.filter(item => (!item.module || myPermissions?.[item.module]?.view !== false) && (!item.adminOnly || isAdminUser)).map((item) => {
          if (item.children) {
            const { icon: Icon, label, children, pending } = item
            const isGroupActive = children.some(c => location.pathname.startsWith(c.to))
            const isOpen = collapsed ? true : !!openGroups[label]
            return (
              <div key={label}>
                {!collapsed && (
                  pending ? (
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm w-[calc(100%-12px)] cursor-not-allowed opacity-50"
                    >
                      <Icon size={18} strokeWidth={1.8} />
                      <span className="truncate flex-1 text-left">{label}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide bg-gray-700 text-gray-400 rounded px-1 py-0.5 flex-shrink-0">pronto</span>
                    </div>
                  ) : (
                  <button
                    onClick={() => toggleGroup(label)}
                    className={`flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-colors w-[calc(100%-12px)]
                      ${isGroupActive ? 'text-brand-400 font-medium' : 'text-gray-400 hover:bg-white/8 hover:text-white'}`}
                  >
                    <Icon size={18} strokeWidth={isGroupActive ? 2.5 : 1.8} />
                    <span className="truncate flex-1 text-left">{label}</span>
                    <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  )
                )}
                {!pending && isOpen && (
                  <div className={!collapsed ? 'ml-3' : ''}>
                    {children.map(({ to, icon: ChildIcon, label: childLabel }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg text-sm transition-colors
                           ${isActive
                             ? 'bg-brand-500/15 text-brand-400 font-medium'
                             : 'hover:bg-white/8 hover:text-white text-gray-400'}`
                        }
                        title={collapsed ? childLabel : undefined}
                      >
                        {({ isActive }) => (
                          <>
                            <ChildIcon size={16} strokeWidth={isActive ? 2.5 : 1.8} className="flex-shrink-0" />
                            {!collapsed && <span className="truncate flex-1">{childLabel}</span>}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const { to, icon: Icon, label, pending } = item as NavItem & { to: string }
          const badge = to === '/inventario' ? stockBajoCount : to === '/aprobaciones' ? aprobacionesCount : 0
          const badgeColor = to === '/aprobaciones' ? 'bg-orange-500' : 'bg-red-500'
          if (pending) {
            return (
              <div
                key={to}
                title={collapsed ? label : undefined}
                className="flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm cursor-not-allowed opacity-50"
              >
                <Icon size={18} strokeWidth={1.8} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{label}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide bg-gray-700 text-gray-400 rounded px-1 py-0.5 flex-shrink-0">pronto</span>
                  </>
                )}
              </div>
            )
          }
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
                      <span className={`absolute -top-1.5 -right-1.5 ${badgeColor} text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1">{label}</span>
                      {badge > 0 && (
                        <span className={`${badgeColor} text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
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
