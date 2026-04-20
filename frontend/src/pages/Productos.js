import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const EMPTY_FORM = {
    nombre: '', descripcion: '', precio_costo: '0', precio_venta: '0',
    margen: '0', stock_minimo: '0', stock_actual: '0', proveedor_id: '',
};
function formatPrecio(n) {
    return `$${Math.round(n)}`;
}
function calcMargen(costo, venta) {
    const c = parseFloat(costo);
    const v = parseFloat(venta);
    if (!v || v <= 0)
        return '0';
    const m = ((v - c) / v) * 100;
    return isNaN(m) ? '0' : m.toFixed(2);
}
export default function Productos() {
    const qc = useQueryClient();
    const [busqueda, setBusqueda] = useState('');
    const { data: productos = [], isLoading } = useQuery({
        queryKey: ['productos', busqueda],
        queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
    });
    const [modalOpen, setModalOpen] = useState(false);
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState(null);
    const [eliminandoId, setEliminandoId] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    function abrirCrear() {
        setEditando(null);
        setForm(EMPTY_FORM);
        setError(null);
        setModalOpen(true);
    }
    function abrirEditar(p) {
        setEditando(p);
        const costo = String(p.precio_costo);
        const venta = String(p.precio_venta);
        setForm({
            nombre: p.nombre,
            descripcion: p.descripcion ?? '',
            precio_costo: costo,
            precio_venta: venta,
            margen: calcMargen(costo, venta),
            stock_minimo: String(p.stock_minimo),
            stock_actual: String(p.stock_actual),
            proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
        });
        setError(null);
        setModalOpen(true);
    }
    function cerrarModal() { setModalOpen(false); setEditando(null); setError(null); }
    const guardar = useMutation({
        mutationFn: (data) => {
            const payload = {
                nombre: data.nombre,
                descripcion: data.descripcion || null,
                precio_costo: parseFloat(data.precio_costo) || 0,
                precio_venta: parseFloat(data.precio_venta) || 0,
                stock_minimo: parseInt(data.stock_minimo) || 0,
                stock_actual: parseInt(data.stock_actual) || 0,
                proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id) : null,
            };
            if (editando)
                return api.patch(`/api/productos/${editando.id}`, payload).then(r => r.data);
            return api.post('/api/productos/', payload).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); cerrarModal(); },
        onError: (e) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/api/productos/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); setEliminandoId(null); setDeleteError(null); },
        onError: (e) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
    });
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Cat\u00E1logo de productos" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => api.get('/api/productos/export/excel', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'catalogo.xlsx'; a.click(); URL.revokeObjectURL(url); }), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Exportar Excel" }), _jsx("button", { onClick: abrirCrear, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar producto" })] })] }), _jsx("input", { type: "text", placeholder: "Buscar por nombre...", value: busqueda, onChange: e => setBusqueda(e.target.value), className: "mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-right px-4 py-3 font-medium", children: "Precio costo" }), _jsx("th", { className: "text-right px-4 py-3 font-medium", children: "Precio venta" }), _jsx("th", { className: "text-right px-4 py-3 font-medium", children: "Stock" }), _jsx("th", { className: "text-right px-4 py-3 font-medium", children: "M\u00EDn." }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [productos.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400", children: "Sin productos registrados" }) })), productos.map(p => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-medium text-gray-900 dark:text-white", children: p.nombre }), p.descripcion && _jsx("div", { className: "text-xs text-gray-400 truncate max-w-xs", children: p.descripcion })] }), _jsx("td", { className: "px-4 py-3 text-right text-gray-500 dark:text-gray-400", children: formatPrecio(p.precio_costo) }), _jsx("td", { className: "px-4 py-3 text-right font-medium text-gray-900 dark:text-white", children: formatPrecio(p.precio_venta) }), _jsxs("td", { className: `px-4 py-2 text-right font-medium ${p.stock_actual < p.stock_minimo ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-900 dark:text-white'}`, children: [p.stock_actual, p.stock_actual < p.stock_minimo && (_jsx("span", { className: "ml-1 text-xs text-red-500", title: "Stock bajo m\u00EDnimo", children: "\u26A0" }))] }), _jsx("td", { className: "px-4 py-3 text-right text-gray-400", children: p.stock_minimo }), _jsx("td", { className: "px-4 py-3", children: eliminandoId === p.id ? (_jsxs("span", { className: "inline-flex items-center gap-2 text-xs", children: [deleteError
                                                        ? _jsx("span", { className: "text-red-500", children: deleteError })
                                                        : _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "\u00BFEliminar?" }), _jsx("button", { onClick: () => eliminar.mutate(p.id), disabled: eliminar.isPending, className: "text-red-600 hover:underline font-medium disabled:opacity-50", children: "S\u00ED" }), _jsx("button", { onClick: () => { setEliminandoId(null); setDeleteError(null); }, className: "text-gray-500 hover:underline", children: "No" })] })) : (_jsxs("span", { className: "inline-flex gap-3", children: [_jsx("button", { onClick: () => abrirEditar(p), className: "text-xs text-blue-600 hover:underline", children: "Editar" }), _jsx("button", { onClick: () => { setEliminandoId(p.id); setDeleteError(null); }, className: "text-xs text-red-500 hover:underline", children: "Eliminar" })] })) })] }, p.id)))] })] }) }), modalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto", children: [_jsx("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: editando ? 'Editar producto' : 'Nuevo producto' }) }), _jsxs("form", { onSubmit: e => { e.preventDefault(); guardar.mutate(form); }, className: "px-6 py-4 grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Nombre *" }), _jsx("input", { type: "text", required: true, value: form.nombre, onChange: e => setForm(f => ({ ...f, nombre: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Descripci\u00F3n" }), _jsx("textarea", { rows: 2, value: form.descripcion, onChange: e => setForm(f => ({ ...f, descripcion: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }), [
                                    { key: 'precio_costo', label: 'Precio costo ($)' },
                                    { key: 'precio_venta', label: 'Precio venta ($)' },
                                    { key: 'stock_minimo', label: 'Stock mínimo' },
                                    { key: 'stock_actual', label: 'Stock actual' },
                                ].map(({ key, label }) => (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: label }), _jsx("input", { type: "number", min: "0", step: key.startsWith('precio') ? '0.01' : '1', value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }, key))), error && _jsx("p", { className: "col-span-2 text-xs text-red-500", children: error }), _jsxs("div", { className: "col-span-2 flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: cerrarModal, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardar.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardar.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) }))] }));
}
