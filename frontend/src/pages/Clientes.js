import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const EMPTY_FORM = {
    nombre: '', rut: '', email: '', telefono: '', direccion_despacho: '', notas: '',
    empresa_id: null, recibe_correo: true, forma_pago: '', despacho_o_retiro: '',
    comuna: '', ultimo_contacto: '', forma_captacion: '', compromiso: '', es_nuevo: false,
};
const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none";
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const READONLY_CLS = "w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400";
export default function Clientes() {
    const qc = useQueryClient();
    const [busqueda, setBusqueda] = useState('');
    const { data: clientes = [], isLoading } = useQuery({
        queryKey: ['clientes', busqueda],
        queryFn: () => api.get(`/api/clientes/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
    });
    const { data: empresas = [] } = useQuery({
        queryKey: ['empresas'],
        queryFn: () => api.get('/api/empresas/').then(r => r.data),
    });
    const [modalOpen, setModalOpen] = useState(false);
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState(null);
    const [eliminandoId, setEliminandoId] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    const empresaSeleccionada = empresas.find(e => e.id === form.empresa_id) ?? null;
    function abrirCrear() {
        setEditando(null);
        setForm(EMPTY_FORM);
        setError(null);
        setModalOpen(true);
    }
    function abrirEditar(c) {
        setEditando(c);
        setForm({
            nombre: c.nombre, rut: c.rut ?? '', email: c.email ?? '', telefono: c.telefono ?? '',
            direccion_despacho: c.direccion_despacho ?? '', notas: c.notas ?? '',
            empresa_id: c.empresa_id, recibe_correo: c.recibe_correo,
            forma_pago: c.forma_pago ?? '', despacho_o_retiro: c.despacho_o_retiro ?? '',
            comuna: c.comuna ?? '', ultimo_contacto: c.ultimo_contacto ?? '',
            forma_captacion: c.forma_captacion ?? '', compromiso: c.compromiso ?? '',
            es_nuevo: c.es_nuevo,
        });
        setError(null);
        setModalOpen(true);
    }
    function cerrarModal() { setModalOpen(false); setEditando(null); setError(null); }
    const guardar = useMutation({
        mutationFn: (data) => {
            const payload = {
                ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])),
                recibe_correo: data.recibe_correo,
                es_nuevo: data.es_nuevo,
                empresa_id: data.empresa_id,
            };
            if (editando)
                return api.patch(`/api/clientes/${editando.id}`, payload).then(r => r.data);
            return api.post('/api/clientes/', payload).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarModal(); },
        onError: (e) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminar = useMutation({
        mutationFn: (id) => api.delete(`/api/clientes/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); setEliminandoId(null); setDeleteError(null); },
        onError: (e) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
    });
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Clientes" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => api.get('/api/clientes/export/excel', { responseType: 'blob' }).then(r => {
                                    const url = URL.createObjectURL(r.data);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'clientes.xlsx';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Exportar Excel" }), _jsx("button", { onClick: abrirCrear, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar cliente" })] })] }), _jsx("input", { type: "text", placeholder: "Buscar por nombre o RUT...", value: busqueda, onChange: e => setBusqueda(e.target.value), className: "mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Empresa" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "RUT" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Email" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Tel\u00E9fono" }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [clientes.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400", children: "Sin clientes registrados" }) })), clientes.map(c => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: c.nombre }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.empresa?.nombre ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.rut ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.email ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.telefono ?? '—' }), _jsx("td", { className: "px-4 py-3", children: eliminandoId === c.id ? (_jsxs("span", { className: "inline-flex items-center gap-2 text-xs", children: [deleteError
                                                        ? _jsx("span", { className: "text-red-500", children: deleteError })
                                                        : _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "\u00BFEliminar?" }), _jsx("button", { onClick: () => eliminar.mutate(c.id), disabled: eliminar.isPending, className: "text-red-600 hover:underline font-medium disabled:opacity-50", children: "S\u00ED" }), _jsx("button", { onClick: () => { setEliminandoId(null); setDeleteError(null); }, className: "text-gray-500 hover:underline", children: "No" })] })) : (_jsxs("span", { className: "inline-flex gap-3", children: [_jsx("button", { onClick: () => abrirEditar(c), className: "text-xs text-blue-600 hover:underline", children: "Editar" }), _jsx("button", { onClick: () => { setEliminandoId(c.id); setDeleteError(null); }, className: "text-xs text-red-500 hover:underline", children: "Eliminar" })] })) })] }, c.id)))] })] }) }), modalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto", children: [_jsx("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: editando ? 'Editar cliente' : 'Nuevo cliente' }) }), _jsxs("form", { onSubmit: ev => { ev.preventDefault(); guardar.mutate(form); }, className: "px-6 py-4 grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: LABEL_CLS, children: "Empresa" }), _jsxs("select", { value: form.empresa_id ?? '', onChange: e => setForm(f => ({ ...f, empresa_id: e.target.value ? Number(e.target.value) : null })), className: INPUT_CLS, children: [_jsx("option", { value: "", children: "\u2014 Sin empresa \u2014" }), empresas.map(e => _jsx("option", { value: e.id, children: e.nombre }, e.id))] })] }), empresaSeleccionada && (_jsxs(_Fragment, { children: [empresaSeleccionada.rut && (_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "RUT Empresa" }), _jsx("div", { className: READONLY_CLS, children: empresaSeleccionada.rut })] })), empresaSeleccionada.razon_social && (_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Raz\u00F3n Social" }), _jsx("div", { className: READONLY_CLS, children: empresaSeleccionada.razon_social })] }))] })), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: LABEL_CLS, children: "Nombre *" }), _jsx("input", { type: "text", required: true, value: form.nombre, onChange: e => setForm(f => ({ ...f, nombre: e.target.value })), className: INPUT_CLS })] }), ([
                                    { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                                    { key: 'email', label: 'Email', placeholder: 'contacto@empresa.cl' },
                                    { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
                                    { key: 'forma_pago', label: 'Forma de Pago' },
                                    { key: 'comuna', label: 'Comuna' },
                                ]).map(({ key, label, placeholder }) => (_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: label }), _jsx("input", { type: "text", placeholder: placeholder, value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })), className: INPUT_CLS })] }, key))), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Despacho o Retiro" }), _jsxs("select", { value: form.despacho_o_retiro, onChange: e => setForm(f => ({ ...f, despacho_o_retiro: e.target.value })), className: INPUT_CLS, children: [_jsx("option", { value: "", children: "\u2014 Sin definir \u2014" }), _jsx("option", { value: "despacho", children: "Despacho" }), _jsx("option", { value: "retiro", children: "Retiro" })] })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "\u00DAltimo Contacto" }), _jsx("input", { type: "date", value: form.ultimo_contacto, onChange: e => setForm(f => ({ ...f, ultimo_contacto: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Forma Captaci\u00F3n" }), _jsx("input", { type: "text", value: form.forma_captacion, onChange: e => setForm(f => ({ ...f, forma_captacion: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: LABEL_CLS, children: "Direcci\u00F3n de Despacho" }), _jsx("input", { type: "text", value: form.direccion_despacho, onChange: e => setForm(f => ({ ...f, direccion_despacho: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: LABEL_CLS, children: "Compromiso" }), _jsx("textarea", { rows: 2, value: form.compromiso, onChange: e => setForm(f => ({ ...f, compromiso: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: LABEL_CLS, children: "Notas" }), _jsx("textarea", { rows: 2, value: form.notas, onChange: e => setForm(f => ({ ...f, notas: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { type: "checkbox", id: "recibe_correo", checked: form.recibe_correo, onChange: e => setForm(f => ({ ...f, recibe_correo: e.target.checked })), className: "w-4 h-4 text-blue-600 rounded" }), _jsx("label", { htmlFor: "recibe_correo", className: "text-sm text-gray-700 dark:text-gray-300", children: "Recibe correo" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { type: "checkbox", id: "es_nuevo", checked: form.es_nuevo, onChange: e => setForm(f => ({ ...f, es_nuevo: e.target.checked })), className: "w-4 h-4 text-blue-600 rounded" }), _jsx("label", { htmlFor: "es_nuevo", className: "text-sm text-gray-700 dark:text-gray-300", children: "Es nuevo" })] }), error && _jsx("p", { className: "col-span-2 text-xs text-red-500", children: error }), _jsxs("div", { className: "col-span-2 flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: cerrarModal, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardar.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardar.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) }))] }));
}
