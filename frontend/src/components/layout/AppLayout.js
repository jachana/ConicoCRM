import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, ShoppingCart, Users, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
const BOTTOM_TABS = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/cotizaciones', icon: FileText, label: 'Cotiz.', end: false },
    { to: '/notas-venta', icon: ShoppingCart, label: 'NV', end: false },
    { to: '/clientes', icon: Users, label: 'Clientes', end: false },
];
export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    return (_jsxs("div", { className: "flex h-screen bg-gray-50 dark:bg-[#0B0F1A] overflow-hidden", children: [_jsx("div", { className: "hidden md:flex flex-shrink-0", children: _jsx(Sidebar, { collapsed: collapsed, onToggle: () => setCollapsed(c => !c) }) }), drawerOpen && (_jsxs("div", { className: "md:hidden fixed inset-0 z-50 flex", children: [_jsx("div", { className: "absolute inset-0 bg-black/60 backdrop-blur-sm", onClick: () => setDrawerOpen(false) }), _jsx("div", { className: "relative w-72 animate-slide-in shadow-2xl", children: _jsx(Sidebar, { collapsed: false, onToggle: () => setDrawerOpen(false), onClose: () => setDrawerOpen(false) }) })] })), _jsxs("div", { className: "flex-1 flex flex-col overflow-hidden min-w-0", children: [_jsxs("header", { className: "md:hidden flex items-center justify-between h-12 px-4 bg-[#111827] border-b border-white/5 flex-shrink-0", children: [_jsx("button", { onClick: () => setDrawerOpen(true), "aria-label": "Abrir men\u00FA", className: "p-1.5 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors", children: _jsx(Menu, { size: 20 }) }), _jsx("span", { className: "text-sm font-bold tracking-widest text-white", children: "CONICO" }), _jsx("div", { className: "w-8" })] }), _jsx("main", { className: "flex-1 overflow-auto scroll-pb-nav md:pb-0", children: _jsx(Outlet, {}) })] }), _jsx("nav", { className: "md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#111827] border-t border-white/5 pb-safe", children: _jsxs("div", { className: "flex h-14", children: [BOTTOM_TABS.map(({ to, icon: Icon, label, end }) => (_jsx(NavLink, { to: to, end: end, className: ({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                 ${isActive ? 'text-brand-400' : 'text-gray-500 active:text-gray-300'}`, children: ({ isActive }) => (_jsxs(_Fragment, { children: [_jsx(Icon, { size: 20, strokeWidth: isActive ? 2.5 : 1.8 }), _jsx("span", { className: "text-[10px] font-medium", children: label })] })) }, to))), _jsxs("button", { onClick: () => setDrawerOpen(true), className: "flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-500 active:text-gray-300 transition-colors", children: [_jsx(Menu, { size: 20, strokeWidth: 1.8 }), _jsx("span", { className: "text-[10px] font-medium", children: "M\u00E1s" })] })] }) })] }));
}
