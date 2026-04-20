import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const EMPTY_FORM = {
    nombre: '', razon_social: '', rut: '', forma_pago: '',
    prioridad: '', sector: '', email: '', nota_cobranza: '', ubicacion: '',
};
export default function Empresas() {
    const qc = useQueryClient();
    const [busqueda, setBusqueda] = useState('');
    const { data: empresas = [], isLoading } = useQuery({
        queryKey: ['empresas', busqueda],
        queryFn: () => api.get(`/api/empresas/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
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
    function abrirEditar(e) {
        setEditando(e);
        setForm({
            nombre: e.nombre, razon_social: e.razon_social ?? '', rut: e.rut ?? '',
            forma_pago: e.forma_pago ?? '', prioridad: e.prioridad ?? '', sector: e.sector ?? '',
            email: e.email ?? '', nota_cobranza: e.nota_cobranza ?? '', ubicacion: e.ubicacion ?? '',
        });
        setError(null);
        setModalOpen(true);
    }
    function cerrarModal() { setModalOpen(false); setEditando(null); setError(null); }
    const guardar = useMutation({
        mutationFn: (data) => {
            const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]));
            if (editando)
                return api.patch(`/api/empresas/${editando.id}`, payload).then(r => r.data);
            return api.post('/api/empresas/', payload).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); cerrarModal(); },
        onError: (e) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/api/empresas/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); setEliminandoId(null); setDeleteError(null); },
        onError: (e) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
    });
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Empresas" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => api.get('/api/empresas/export/excel', { responseType: 'blob' }).then(r => {
                                    const url = URL.createObjectURL(r.data);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'empresas.xlsx';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Exportar Excel" }), _jsx("button", { onClick: abrirCrear, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar empresa" })] })] }), _jsx("input", { type: "text", placeholder: "Buscar por nombre o RUT...", value: busqueda, onChange: e => setBusqueda(e.target.value), className: "mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Raz\u00F3n Social" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "RUT" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Forma Pago" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Prioridad" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Sector" }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [empresas.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-8 text-center text-gray-400", children: "Sin empresas registradas" }) })), empresas.map(e => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: e.nombre }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.razon_social ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.rut ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.forma_pago ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.prioridad ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.sector ?? '—' }), _jsx("td", { className: "px-4 py-3", children: eliminandoId === e.id ? (_jsxs("span", { className: "inline-flex items-center gap-2 text-xs", children: [deleteError
                                                        ? _jsx("span", { className: "text-red-500", children: deleteError })
                                                        : _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "\u00BFEliminar?" }), _jsx("button", { onClick: () => eliminar.mutate(e.id), disabled: eliminar.isPending, className: "text-red-600 hover:underline font-medium disabled:opacity-50", children: "S\u00ED" }), _jsx("button", { onClick: () => { setEliminandoId(null); setDeleteError(null); }, className: "text-gray-500 hover:underline", children: "No" })] })) : (_jsxs("span", { className: "inline-flex gap-3", children: [_jsx("button", { onClick: () => abrirEditar(e), className: "text-xs text-blue-600 hover:underline", children: "Editar" }), _jsx("button", { onClick: () => { setEliminandoId(e.id); setDeleteError(null); }, className: "text-xs text-red-500 hover:underline", children: "Eliminar" })] })) })] }, e.id)))] })] }) }), modalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto", children: [_jsx("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: editando ? 'Editar empresa' : 'Nueva empresa' }) }), _jsxs("form", { onSubmit: ev => { ev.preventDefault(); guardar.mutate(form); }, className: "px-6 py-4 grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Nombre *" }), _jsx("input", { type: "text", required: true, value: form.nombre, onChange: e => setForm(f => ({ ...f, nombre: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }), ([
                                    { key: 'razon_social', label: 'Razón Social' },
                                    { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                                    { key: 'forma_pago', label: 'Forma de Pago' },
                                    { key: 'prioridad', label: 'Prioridad' },
                                    { key: 'sector', label: 'Sector' },
                                    { key: 'email', label: 'Email' },
                                ]).map(({ key, label, placeholder }) => (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: label }), _jsx("input", { type: "text", placeholder: placeholder, value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }, key))), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Ubicaci\u00F3n sede central" }), _jsx("input", { type: "text", value: form.ubicacion, onChange: e => setForm(f => ({ ...f, ubicacion: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Nota Cobranza" }), _jsx("textarea", { rows: 2, value: form.nota_cobranza, onChange: e => setForm(f => ({ ...f, nota_cobranza: e.target.value })), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" })] }), error && _jsx("p", { className: "col-span-2 text-xs text-red-500", children: error }), _jsxs("div", { className: "col-span-2 flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: cerrarModal, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardar.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardar.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) }))] }));
}
