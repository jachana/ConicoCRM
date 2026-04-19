import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const MODULES = [
    'catalogo', 'clientes', 'empresas', 'proveedores', 'cotizaciones', 'nota_venta',
    'facturas', 'ordenes_compra', 'inventario', 'rrhh', 'dashboard', 'usuarios',
];
const ACTIONS = ['view', 'create', 'edit', 'delete'];
const MODULE_LABELS = {
    catalogo: 'Catálogo', clientes: 'Clientes', empresas: 'Empresas', proveedores: 'Proveedores',
    cotizaciones: 'Cotizaciones', nota_venta: 'Nota de Venta', facturas: 'Facturas',
    ordenes_compra: 'Órdenes de Compra', inventario: 'Inventario',
    rrhh: 'RRHH', dashboard: 'Dashboard', usuarios: 'Usuarios',
};
const ACTION_LABELS = {
    view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar',
};
export default function Users() {
    const qc = useQueryClient();
    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => api.get('/api/users').then(r => r.data),
    });
    const [selectedUser, setSelectedUser] = useState(null);
    const [permissions, setPermissions] = useState(null);
    const [permissionsError, setPermissionsError] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const savePermissions = useMutation({
        mutationFn: ({ userId, payload }) => api.put(`/api/users/${userId}/permissions`, payload).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            setSelectedUser(null);
            setPermissions(null);
            setSaveError(null);
        },
        onError: () => {
            setSaveError('No se pudo guardar. Intenta de nuevo.');
        },
    });
    async function openPermissions(user) {
        setPermissionsError(null);
        setSelectedUser(user);
        try {
            const res = await api.get(`/api/users/${user.id}/permissions`);
            setPermissions(res.data);
        }
        catch {
            setSelectedUser(null);
            setPermissionsError(user.id.toString());
        }
    }
    function toggle(module, action) {
        if (!permissions)
            return;
        setPermissions({ ...permissions, [module]: { ...permissions[module], [action]: !permissions[module][action] } });
    }
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-6 max-w-5xl", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white mb-4", children: "Usuarios" }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Email" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Rol" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Estado" }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: users.map(u => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: u.name }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: u.email }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: "px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", children: u.role }) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { "aria-label": u.is_active ? 'Activo' : 'Inactivo', className: `inline-block w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-gray-400'}` }) }), _jsx("td", { className: "px-4 py-3", children: u.role !== 'admin' && (_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("button", { onClick: () => openPermissions(u), className: "text-xs text-blue-600 hover:underline", children: "Permisos" }), permissionsError === u.id.toString() && (_jsx("span", { className: "text-xs text-red-500", children: "Error al cargar" }))] })) })] }, u.id))) })] }) }), selectedUser && permissions && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col", children: [_jsxs("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: [_jsxs("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: ["Permisos: ", selectedUser.name] }), _jsxs("p", { className: "text-xs text-gray-500 mt-0.5", children: ["Rol base: ", selectedUser.role] })] }), _jsx("div", { className: "overflow-auto flex-1 px-6 py-4", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-500 dark:text-gray-400", children: [_jsx("th", { className: "text-left py-2 pr-6 font-medium", children: "M\u00F3dulo" }), ACTIONS.map(a => (_jsx("th", { className: "text-center py-2 px-3 font-medium", children: ACTION_LABELS[a] }, a)))] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: MODULES.map(module => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/30", children: [_jsx("td", { className: "py-2 pr-6 text-gray-700 dark:text-gray-300 font-medium", children: MODULE_LABELS[module] }), ACTIONS.map(action => (_jsx("td", { className: "text-center py-2 px-3", children: _jsx("input", { type: "checkbox", checked: permissions[module]?.[action] ?? false, onChange: () => toggle(module, action), className: "w-4 h-4 cursor-pointer accent-blue-600" }) }, action)))] }, module))) })] }) }), _jsxs("div", { className: "px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2", children: [saveError && _jsx("p", { className: "text-xs text-red-500 mr-auto", children: saveError }), _jsx("button", { onClick: () => { setSelectedUser(null); setPermissions(null); setSaveError(null); }, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { onClick: () => savePermissions.mutate({ userId: selectedUser.id, payload: permissions }), disabled: savePermissions.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: savePermissions.isPending ? 'Guardando...' : 'Guardar permisos' })] })] }) }))] }));
}
