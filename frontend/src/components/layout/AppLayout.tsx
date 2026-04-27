import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, ShoppingCart, Users, Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import GlobalSearchModal from '../search/GlobalSearchModal'
import SearchButton from '../search/SearchButton'
import { useGlobalShortcut } from '../../hooks/useGlobalShortcut'
import { usePreferencesStore } from '../../stores/preferences'

const BOTTOM_TABS = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/cotizaciones', icon: FileText,        label: 'Cotiz.',    end: false },
  { to: '/notas-venta',  icon: ShoppingCart,    label: 'NV',        end: false },
  { to: '/clientes',     icon: Users,           label: 'Clientes',  end: false },
]

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const atajo = usePreferencesStore(s => s.preferencias.busqueda_atajo)
  useGlobalShortcut(atajo, () => setSearchOpen(true))

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0B0F1A] overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>

      {/* ── Mobile slide-in drawer ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-72 animate-slide-in shadow-2xl">
            <Sidebar
              collapsed={false}
              onToggle={() => setDrawerOpen(false)}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Content column ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between h-12 px-4 bg-[#111827] border-b border-white/5 flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="p-1.5 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold tracking-widest text-white">CONICO</span>
          <SearchButton onClick={() => setSearchOpen(true)} />
        </header>

        {/* Desktop header strip */}
        <header className="hidden md:flex items-center justify-end gap-2 h-10 px-4 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#0f1422] flex-shrink-0">
          <SearchButton onClick={() => setSearchOpen(true)} />
        </header>

        {/* Page content — extra bottom padding on mobile for bottom nav */}
        <main className="flex-1 overflow-auto scroll-pb-nav md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#111827] border-t border-white/5 pb-safe">
        <div className="flex h-14">
          {BOTTOM_TABS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                 ${isActive ? 'text-brand-400' : 'text-gray-500 active:text-gray-300'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú completo"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-500 active:text-gray-300 transition-colors"
          >
            <Menu size={20} strokeWidth={1.8} />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      <GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
