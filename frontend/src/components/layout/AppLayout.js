import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
export default function AppLayout() {
    const [collapsed, setCollapsed] = useState(false);
    return (_jsxs("div", { className: "flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden", children: [_jsx(Sidebar, { collapsed: collapsed, onToggle: () => setCollapsed(c => !c) }), _jsx("main", { className: "flex-1 overflow-auto", children: _jsx(Outlet, {}) })] }));
}
