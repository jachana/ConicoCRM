import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const CAMPOS = [
    { key: 'nombre', label: 'Nombre', required: true, colSpan: 2 },
    { key: 'rut', label: 'RUT', required: false, colSpan: 1 },
    { key: 'contacto', label: 'Contacto', required: false, colSpan: 1 },
    { key: 'email', label: 'Email', required: false, colSpan: 1 },
    { key: 'telefono', label: 'Teléfono', required: false, colSpan: 1 },
    { key: 'notas', label: 'Notas', required: false, colSpan: 2, textarea: true },
];
const EMPTY_FORM = { nombre: '', rut: '', contacto: '', email: '', telefono: '', notas: '' };
export default function Proveedores() {
    const qc = useQueryClient();
    const { data: proveedores = [], isLoading } = useQuery({
        queryKey: ['proveedores'],
        queryFn: () => api.get('/api/proveedores/').then(r => r.data),
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
        setForm({ nombre: p.nombre, rut: p.rut ?? '', contacto: p.contacto ?? '', email: p.email ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '' });
        setError(null);
        setModalOpen(true);
    }
    function cerrarModal() {
        setModalOpen(false);
        setEditando(null);
        setError(null);
    }
    const guardar = useMutation({
        mutationFn: (data) => {
            const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]));
            if (editando)
                return api.patch(`/api/proveedores/${editando.id}`, payload).then(r => r.data);
            return api.post('/api/proveedores/', payload).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); cerrarModal(); },
        onError: (e) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/api/proveedores/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); setEliminandoId(null); setDeleteError(null); },
        onError: (e) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
    });
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-6 max-w-5xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Proveedores" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => api.get('/api/proveedores/export/excel', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'proveedores.xlsx'; a.click(); URL.revokeObjectURL(url); }), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Exportar Excel" }), _jsx("button", { onClick: abrirCrear, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar proveedor" })] })] }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "RUT" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Contacto" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Email" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Tel\u00E9fono" }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [proveedores.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400", children: "Sin proveedores registrados" }) })), proveedores.map(p => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: p.nombre }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: p.rut ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: p.contacto ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: p.email ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: p.telefono ?? '—' }), _jsx("td", { className: "px-4 py-3", children: eliminandoId === p.id ? (_jsxs("span", { className: "inline-flex items-center gap-2 text-xs", children: [deleteError
                                                        ? _jsx("span", { className: "text-red-500", children: deleteError })
                                                        : _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "\u00BFEliminar?" }), _jsx("button", { onClick: () => eliminar.mutate(p.id), disabled: eliminar.isPending, className: "text-red-600 hover:underline font-medium disabled:opacity-50", children: "S\u00ED" }), _jsx("button", { onClick: () => { setEliminandoId(null); setDeleteError(null); }, className: "text-gray-500 hover:underline", children: "No" })] })) : (_jsxs("span", { className: "inline-flex gap-3", children: [_jsx("button", { onClick: () => abrirEditar(p), className: "text-xs text-blue-600 hover:underline", children: "Editar" }), _jsx("button", { onClick: () => { setEliminandoId(p.id); setDeleteError(null); }, className: "text-xs text-red-500 hover:underline", children: "Eliminar" })] })) })] }, p.id)))] })] }) }), modalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg", children: [_jsx("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: editando ? 'Editar proveedor' : 'Nuevo proveedor' }) }), _jsxs("form", { onSubmit: e => { e.preventDefault(); guardar.mutate(form); }, className: "px-6 py-4 grid grid-cols-2 gap-4", children: [CAMPOS.map(campo => (_jsxs("div", { className: campo.colSpan === 2 ? 'col-span-2' : '', children: [_jsxs("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: [campo.label, campo.required && ' *'] }), ('textarea' in campo && campo.textarea) ? (_jsx("textarea", { value: form[campo.key], onChange: e => setForm(f => ({ ...f, [campo.key]: e.target.value })), rows: 3, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })) : (_jsx("input", { type: "text", value: form[campo.key], onChange: e => setForm(f => ({ ...f, [campo.key]: e.target.value })), required: campo.required, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }))] }, campo.key))), error && _jsx("p", { className: "col-span-2 text-xs text-red-500", children: error }), _jsxs("div", { className: "col-span-2 flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: cerrarModal, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardar.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardar.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) }))] }));
}
