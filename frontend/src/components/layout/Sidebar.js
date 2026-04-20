import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Package, ShoppingCart, Warehouse, Receipt, Truck, UserCog, Building2, ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useTheme } from './ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
const NAV = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/cotizaciones', icon: FileText, label: 'Cotizaciones' },
    { to: '/clientes', icon: Users, label: 'Clientes' },
    { to: '/empresas', icon: Building2, label: 'Empresas' },
    { to: '/catalogo', icon: Package, label: 'Catálogo' },
    { to: '/notas-venta', icon: ShoppingCart, label: 'Notas de Venta' },
    { to: '/facturas', icon: Receipt, label: 'Facturas' },
    { to: '/inventario', icon: Warehouse, label: 'Inventario' },
    { to: '/ordenes-compra', icon: ShoppingCart, label: 'Órdenes de Compra' },
    { to: '/proveedores', icon: Truck, label: 'Proveedores' },
    { to: '/rrhh', icon: UserCog, label: 'RRHH' },
    { to: '/usuarios', icon: Users, label: 'Usuarios' },
];
export default function Sidebar({ collapsed, onToggle, onClose }) {
    const logout = useAuthStore(s => s.logout);
    const user = useAuthStore(s => s.user);
    const { theme, toggle: toggleTheme } = useTheme();
    const { data: stockBajo = [] } = useQuery({
        queryKey: ['stock-bajo'],
        queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
        enabled: !!user && user.role !== 'vendedor',
        staleTime: 60000,
    });
    const stockBajoCount = stockBajo.length;
    return (_jsxs("aside", { className: `flex flex-col h-full bg-[#111827] text-gray-300 transition-all duration-200 flex-shrink-0
                  ${collapsed ? 'w-14' : 'w-64'}`, children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-4 border-b border-white/5", children: [!collapsed && (_jsx("span", { className: "font-bold text-white tracking-widest text-sm", children: "CONICO" })), onClose ? (_jsx("button", { "aria-label": "Cerrar men\u00FA", onClick: onClose, className: "p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0 text-gray-400 hover:text-white", children: _jsx(X, { size: 18 }) })) : (_jsx("button", { "aria-label": "toggle-sidebar", onClick: onToggle, className: "p-1.5 rounded-lg hover:bg-white/10 transition-colors ml-auto flex-shrink-0 text-gray-400 hover:text-white", children: collapsed ? _jsx(ChevronRight, { size: 16 }) : _jsx(ChevronLeft, { size: 16 }) }))] }), _jsx("nav", { className: "flex-1 overflow-y-auto py-2 space-y-0.5", children: NAV.map(({ to, icon: Icon, label }) => {
                    const badge = to === '/inventario' ? stockBajoCount : 0;
                    return (_jsx(NavLink, { to: to, end: to === '/', onClick: onClose, className: ({ isActive }) => `flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-colors
                 ${isActive
                            ? 'bg-brand-500/15 text-brand-400 font-medium'
                            : 'hover:bg-white/8 hover:text-white text-gray-400'}`, title: collapsed ? label : undefined, children: ({ isActive }) => (_jsxs(_Fragment, { children: [_jsxs("span", { className: "relative flex-shrink-0", children: [_jsx(Icon, { size: 18, strokeWidth: isActive ? 2.5 : 1.8 }), badge > 0 && collapsed && (_jsx("span", { className: "absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5", children: badge > 99 ? '99+' : badge }))] }), !collapsed && (_jsxs(_Fragment, { children: [_jsx("span", { className: "truncate flex-1", children: label }), badge > 0 && (_jsx("span", { className: "bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1", children: badge > 99 ? '99+' : badge }))] }))] })) }, to));
                }) }), _jsxs("div", { className: "border-t border-white/5 p-2 space-y-0.5", children: [_jsxs("button", { onClick: toggleTheme, className: "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-white/8 hover:text-white transition-colors", title: collapsed ? (theme === 'dark' ? 'Modo claro' : 'Modo oscuro') : undefined, children: [theme === 'dark' ? _jsx(Sun, { size: 18, strokeWidth: 1.8 }) : _jsx(Moon, { size: 18, strokeWidth: 1.8 }), !collapsed && _jsx("span", { children: theme === 'dark' ? 'Modo claro' : 'Modo oscuro' })] }), !collapsed && user && (_jsx("div", { className: "px-3 py-1 text-xs text-gray-500 truncate", children: user.name })), _jsxs("button", { onClick: logout, className: "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-400 hover:bg-red-950/60 hover:text-red-400 transition-colors", title: collapsed ? 'Salir' : undefined, children: [_jsx(LogOut, { size: 18, strokeWidth: 1.8 }), !collapsed && _jsx("span", { children: "Salir" })] })] })] }));
}
