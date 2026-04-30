import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, ClipboardList, Settings, Banknote, BarChart2, CheckSquare, AlarmClock, ShieldCheck,
  Receipt, ScrollText, FileMinus, FilePlus, Contact, Download, Target,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useTheme } from './ThemeProvider'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import MisPendientesWidget from '../MisPendientesWidget'
import { useEffectivePermissions } from '../../hooks/useEffectivePermissions'
import { usePreferencesStore } from '../../stores/preferences'
import type { Module } from '../../types'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  module?: Module
  adminOnly?: boolean
  end?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    label: 'General',
    items: [
      { to: '/',             icon: LayoutDashboard, label: 'Dashboard',    module: 'dashboard' },
      { to: '/aprobaciones', icon: ClipboardList,   label: 'Aprobaciones', adminOnly: true },
      { to: '/tareas',       icon: CheckSquare,     label: 'Tareas' },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { to: '/clientes',     icon: Contact,      label: 'Clientes',       module: 'clientes' },
      { to: '/empresas',     icon: Building2,    label: 'Empresas',       module: 'empresas' },
      { to: '/pipeline',     icon: Target,       label: 'Pipeline',       module: 'cotizaciones' },
      { to: '/cotizaciones', icon: FileText,     label: 'Cotizaciones',   module: 'cotizaciones' },
      { to: '/notas-venta',  icon: ShoppingCart, label: 'Notas de Venta', module: 'nota_venta' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/catalogo',                  icon: Package,   label: 'Catálogo',          module: 'catalogo' },
      { to: '/inventario',                icon: Warehouse, label: 'Inventario',        module: 'inventario', end: true },
      { to: '/inventario/listas-precios', icon: FileText,  label: 'Listas de precios', adminOnly: true },
    ],
  },
  {
    label: 'Cobranza',
    items: [
      { to: '/cobranza',       icon: Banknote,   label: 'Cobranza',           adminOnly: true },
      { to: '/facturas',       icon: Receipt,    label: 'Facturas',           module: 'facturas' },
      { to: '/boletas',        icon: ScrollText, label: 'Boletas',            module: 'boletas' },
      { to: '/guias-despacho', icon: Truck,      label: 'Guías de Despacho',  module: 'guias_despacho' },
      { to: '/notas-credito',  icon: FileMinus,  label: 'Notas de Crédito',   adminOnly: true },
      { to: '/notas-debito',   icon: FilePlus,   label: 'Notas de Débito',    adminOnly: true },
      { to: '/pagos',          icon: CreditCard, label: 'Pagos',              adminOnly: true },
    ],
  },
  {
    label: 'Compras',
    items: [
      { to: '/ordenes-compra',   icon: ShoppingCart, label: 'Órdenes de Compra',     module: 'ordenes_compra' },
      { to: '/facturas-compra',  icon: Receipt,      label: 'Facturas de Compra',     adminOnly: true },
      { to: '/proveedores',      icon: Truck,        label: 'Proveedores',            module: 'proveedores' },
    ],
  },
  {
    label: 'Operación',
    items: [
      { to: '/reportes', icon: BarChart2, label: 'Reportes', adminOnly: true },
      { to: '/rrhh',     icon: UserCog,   label: 'RRHH',     module: 'rrhh' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: '/usuarios',            icon: Users,      label: 'Usuarios',         module: 'usuarios' },
      { to: '/configuracion',       icon: Settings,   label: 'Configuración',    adminOnly: true },
      { to: '/admin/tareas/config', icon: AlarmClock, label: 'Reglas de tareas', adminOnly: true },
      { to: '/admin/auditoria',     icon: ShieldCheck, label: 'Auditoría',       adminOnly: true },
      { to: '/admin/migracion',     icon: Download,    label: 'Migración inicial', adminOnly: true },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const { theme, toggle: toggleTheme } = useTheme()
  const location = useLocation()

  const { permissions: myPermissions, role: effectiveRole } = useEffectivePermissions()
  const isAdminUser = effectiveRole === 'admin' || effectiveRole === 'subadmin'
  const sidebarHidden = usePreferencesStore(s => s.preferencias.sidebar_hidden ?? [])

  const canViewInventario = !!user && effectiveRole !== 'vendedor' && myPermissions?.inventario?.view !== false

  const { data: stockBajo = [] } = useQuery<{ id: number }[]>({
    queryKey: ['stock-bajo'],
    queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
    enabled: canViewInventario,
    staleTime: 60_000,
  })
  const stockBajoCount = stockBajo.length

  const { data: aprobacionesPendientes = [] } = useQuery<{ id: number }[]>({
    queryKey: ['aprobaciones-pendientes'],
    queryFn: () => api.get('/api/aprobaciones/?estado=pendiente').then(r => r.data),
    enabled: isAdminUser,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const aprobacionesCount = aprobacionesPendientes.length

  const isVisible = (item: NavItem) =>
    (item.to === '/configuracion' || !sidebarHidden.includes(item.to)) &&
    (!item.module || myPermissions?.[item.module]?.view !== false) &&
    (!item.adminOnly || isAdminUser)

  const visibleSections = SECTIONS
    .map(s => ({ ...s, items: s.items.filter(isVisible) }))
    .filter(s => s.items.length > 0)

  const badgeFor = (to: string): { count: number; color: string } | null => {
    if (to === '/inventario' && stockBajoCount > 0) return { count: stockBajoCount, color: 'bg-danger-500' }
    if (to === '/aprobaciones' && aprobacionesCount > 0) return { count: aprobacionesCount, color: 'bg-warning-500' }
    return null
  }

  return (
    <aside
      className={`flex flex-col h-full bg-gray-900 text-gray-300 transition-all duration-200 flex-shrink-0
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
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0 text-gray-400 hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleSections.map((section, sIdx) => (
          <div key={section.label} className={sIdx > 0 ? 'mt-3' : ''}>
            {!collapsed ? (
              <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {section.label}
              </div>
            ) : sIdx > 0 ? (
              <div className="border-t border-white/5 mx-3 mb-2" aria-hidden />
            ) : null}

            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavRow
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onClose={onClose}
                  badge={badgeFor(item.to)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <MisPendientesWidget collapsed={collapsed} onClose={onClose} />

      {/* Footer */}
      <div className="border-t border-white/5 p-2 space-y-0.5">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
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
          aria-label="Cerrar sesión"
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-danger-500/10 hover:text-danger-400 transition-colors"
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={18} strokeWidth={1.8} />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}

interface NavRowProps {
  item: NavItem
  collapsed: boolean
  onClose?: () => void
  badge: { count: number; color: string } | null
}

function NavRow({ item, collapsed, onClose, badge }: NavRowProps) {
  const { to, icon: Icon, label } = item

  return (
    <div className="group/row relative">
      <NavLink
        to={to}
        end={to === '/' || !!item.end}
        onClick={onClose}
        className={({ isActive }) =>
          `relative flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-colors
           ${isActive
             ? "bg-brand-500/15 text-brand-400 font-medium before:absolute before:-left-1.5 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-brand-400"
             : 'hover:bg-white/10 hover:text-white text-gray-400'}`
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative flex-shrink-0">
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              {badge && collapsed && (
                <span className={`absolute -top-1.5 -right-1.5 ${badge.color} text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5`}>
                  {badge.count > 99 ? '99+' : badge.count}
                </span>
              )}
            </span>
            {!collapsed && (
              <>
                <span className="truncate flex-1">{label}</span>
                {badge && (
                  <span className={`${badge.color} text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
                    {badge.count > 99 ? '99+' : badge.count}
                  </span>
                )}
              </>
            )}
          </>
        )}
      </NavLink>
      {collapsed && <Flyout label={label} />}
    </div>
  )
}

function Flyout({ label }: { label: string }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
                 px-2.5 py-1.5 bg-gray-900 border border-white/10 rounded-md shadow-lg
                 text-xs text-gray-100 whitespace-nowrap
                 opacity-0 invisible -translate-x-1
                 group-hover/row:opacity-100 group-hover/row:visible group-hover/row:translate-x-0
                 transition-all duration-150"
    >
      {label}
    </div>
  )
}
