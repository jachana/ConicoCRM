import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none";
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const EMPTY_FORM = { nombre: '', cargo: '', sueldo_base: '', fecha_ingreso: '', is_active: true };
const EMPTY_VAC = { fecha_inicio: '', fecha_fin: '', dias: '', descripcion: '' };
function calcDias(inicio, fin) {
    if (!inicio || !fin)
        return 0;
    const diff = (new Date(fin).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(diff) + 1);
}
const TIPO_LABELS = { contrato: 'Contrato', liquidacion: 'Liquidación', otro: 'Otro' };
export default function RRHH() {
    const qc = useQueryClient();
    const [busqueda, setBusqueda] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [vacModalOpen, setVacModalOpen] = useState(false);
    const [vacForm, setVacForm] = useState(EMPTY_VAC);
    const [vacError, setVacError] = useState(null);
    const [uploadError, setUploadError] = useState(null);
    const fileInputRef = useRef(null);
    const [uploadTipo, setUploadTipo] = useState('contrato');
    const { data: empleados = [], isLoading } = useQuery({
        queryKey: ['empleados', busqueda],
        queryFn: () => api.get(`/api/empleados/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
    });
    const { data: docs = [] } = useQuery({
        queryKey: ['empleado-docs', detalle?.id],
        queryFn: () => api.get(`/api/empleados/${detalle.id}/documentos/`).then(r => r.data),
        enabled: !!detalle,
    });
    const { data: vacaciones = [] } = useQuery({
        queryKey: ['empleado-vacs', detalle?.id],
        queryFn: () => api.get(`/api/empleados/${detalle.id}/vacaciones/`).then(r => r.data),
        enabled: !!detalle,
    });
    function abrirCrear() {
        setEditando(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalOpen(true);
    }
    function abrirEditar(e) {
        setEditando(e);
        setForm({
            nombre: e.nombre, cargo: e.cargo,
            sueldo_base: e.sueldo_base != null ? String(e.sueldo_base) : '',
            fecha_ingreso: e.fecha_ingreso ?? '',
            is_active: e.is_active,
        });
        setFormError(null);
        setModalOpen(true);
    }
    function abrirDetalle(e) {
        setDetalle(e);
        setUploadError(null);
    }
    const guardarEmpleado = useMutation({
        mutationFn: (data) => {
            const payload = {
                nombre: data.nombre, cargo: data.cargo, is_active: data.is_active,
                sueldo_base: data.sueldo_base ? parseFloat(data.sueldo_base) : null,
                fecha_ingreso: data.fecha_ingreso || null,
            };
            if (editando)
                return api.patch(`/api/empleados/${editando.id}`, payload).then(r => r.data);
            return api.post('/api/empleados/', payload).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); setModalOpen(false); },
        onError: (e) => setFormError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminarEmpleado = useMutation({
        mutationFn: (id) => api.delete(`/api/empleados/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); if (detalle)
            setDetalle(null); },
    });
    const subirDoc = useMutation({
        mutationFn: async ({ file, tipo }) => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('tipo', tipo);
            return api.post(`/api/empleados/${detalle.id}/documentos/`, fd).then(r => r.data);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }); setUploadError(null); },
        onError: (e) => setUploadError(e?.response?.data?.detail ?? 'Error al subir'),
    });
    const eliminarDoc = useMutation({
        mutationFn: (docId) => api.delete(`/api/empleados/${detalle.id}/documentos/${docId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }),
    });
    async function descargarDoc(doc) {
        const resp = await api.get(`/api/empleados/${detalle.id}/documentos/${doc.id}/download`, { responseType: 'blob' });
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nombre;
        a.click();
        URL.revokeObjectURL(url);
    }
    const guardarVac = useMutation({
        mutationFn: (data) => api.post(`/api/empleados/${detalle.id}/vacaciones/`, {
            fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin,
            dias: parseInt(data.dias) || 0, descripcion: data.descripcion || null,
        }).then(r => r.data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }); setVacModalOpen(false); setVacForm(EMPTY_VAC); },
        onError: (e) => setVacError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    const eliminarVac = useMutation({
        mutationFn: (vacId) => api.delete(`/api/empleados/${detalle.id}/vacaciones/${vacId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }),
    });
    if (isLoading)
        return _jsx("div", { className: "p-6 text-gray-500", children: "Cargando..." });
    return (_jsxs("div", { className: "p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "RRHH" }), _jsx("button", { onClick: abrirCrear, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar empleado" })] }), _jsx("input", { type: "text", placeholder: "Buscar por nombre o cargo...", value: busqueda, onChange: e => setBusqueda(e.target.value), className: "mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Nombre" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Cargo" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Sueldo Base" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Fecha Ingreso" }), _jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Estado" }), _jsx("th", { className: "text-left px-4 py-3 font-medium" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [empleados.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400", children: "Sin empleados registrados" }) })), empleados.map(e => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer", onClick: () => abrirDetalle(e), children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: e.nombre }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.cargo }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.sueldo_base != null ? `$${e.sueldo_base.toLocaleString('es-CL')}` : '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: e.fecha_ingreso ?? '—' }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `inline-block px-2 py-0.5 rounded-full text-xs font-medium ${e.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`, children: e.is_active ? 'Activo' : 'Inactivo' }) }), _jsx("td", { className: "px-4 py-3", onClick: ev => ev.stopPropagation(), children: _jsxs("span", { className: "inline-flex gap-3", children: [_jsx("button", { onClick: () => abrirEditar(e), className: "text-xs text-blue-600 hover:underline", children: "Editar" }), _jsx("button", { onClick: () => eliminarEmpleado.mutate(e.id), className: "text-xs text-red-500 hover:underline", children: "Eliminar" })] }) })] }, e.id)))] })] }) }), modalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg", children: [_jsx("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: editando ? 'Editar empleado' : 'Nuevo empleado' }) }), _jsxs("form", { onSubmit: ev => { ev.preventDefault(); guardarEmpleado.mutate(form); }, className: "px-6 py-4 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Nombre *" }), _jsx("input", { type: "text", required: true, value: form.nombre, onChange: e => setForm(f => ({ ...f, nombre: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Cargo *" }), _jsx("input", { type: "text", required: true, value: form.cargo, onChange: e => setForm(f => ({ ...f, cargo: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Sueldo Base" }), _jsx("input", { type: "number", min: "0", step: "1000", value: form.sueldo_base, onChange: e => setForm(f => ({ ...f, sueldo_base: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Fecha Ingreso" }), _jsx("input", { type: "date", value: form.fecha_ingreso, onChange: e => setForm(f => ({ ...f, fecha_ingreso: e.target.value })), className: INPUT_CLS })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { type: "checkbox", id: "is_active", checked: form.is_active, onChange: e => setForm(f => ({ ...f, is_active: e.target.checked })), className: "w-4 h-4 text-blue-600 rounded" }), _jsx("label", { htmlFor: "is_active", className: "text-sm text-gray-700 dark:text-gray-300", children: "Activo" })] }), formError && _jsx("p", { className: "text-xs text-red-500", children: formError }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: () => setModalOpen(false), className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardarEmpleado.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardarEmpleado.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) })), detalle && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col", children: [_jsxs("div", { className: "px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: detalle.nombre }), _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: detalle.cargo })] }), _jsx("button", { onClick: () => setDetalle(null), className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold leading-none", children: "\u00D7" })] }), _jsxs("div", { className: "overflow-auto flex-1 px-6 py-4 space-y-6", children: [_jsxs("section", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-700 dark:text-gray-300", children: "Documentos" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("select", { value: uploadTipo, onChange: e => setUploadTipo(e.target.value), className: "text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300", children: [_jsx("option", { value: "contrato", children: "Contrato" }), _jsx("option", { value: "liquidacion", children: "Liquidaci\u00F3n" }), _jsx("option", { value: "otro", children: "Otro" })] }), _jsx("button", { onClick: () => fileInputRef.current?.click(), className: "text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Subir archivo" }), _jsx("input", { ref: fileInputRef, type: "file", className: "hidden", onChange: e => { const f = e.target.files?.[0]; if (f)
                                                                subirDoc.mutate({ file: f, tipo: uploadTipo }); e.target.value = ''; } })] })] }), uploadError && _jsx("p", { className: "text-xs text-red-500 mb-2", children: uploadError }), docs.length === 0
                                            ? _jsx("p", { className: "text-xs text-gray-400", children: "Sin archivos subidos" })
                                            : _jsx("div", { className: "divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden", children: docs.map(d => (_jsxs("div", { className: "flex items-center justify-between px-3 py-2 text-xs", children: [_jsx("span", { className: "text-gray-700 dark:text-gray-300 font-medium truncate flex-1", children: d.nombre }), _jsx("span", { className: "mx-3 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400", children: TIPO_LABELS[d.tipo] }), _jsx("span", { className: "text-gray-400 mr-3", children: new Date(d.subido_en).toLocaleDateString('es-CL') }), _jsxs("span", { className: "flex gap-2", children: [_jsx("button", { onClick: () => descargarDoc(d), className: "text-blue-600 hover:underline", children: "Descargar" }), _jsx("button", { onClick: () => eliminarDoc.mutate(d.id), className: "text-red-500 hover:underline", children: "Eliminar" })] })] }, d.id))) })] }), _jsxs("section", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-gray-700 dark:text-gray-300", children: "Vacaciones" }), _jsx("button", { onClick: () => { setVacModalOpen(true); setVacForm(EMPTY_VAC); setVacError(null); }, className: "text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: "Agregar per\u00EDodo" })] }), vacaciones.length === 0
                                            ? _jsx("p", { className: "text-xs text-gray-400", children: "Sin per\u00EDodos registrados" })
                                            : _jsx("div", { className: "border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Inicio" }), _jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Fin" }), _jsx("th", { className: "text-left px-3 py-2 font-medium", children: "D\u00EDas" }), _jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Descripci\u00F3n" }), _jsx("th", { className: "px-3 py-2" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: vacaciones.map(v => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-2 text-gray-700 dark:text-gray-300", children: v.fecha_inicio }), _jsx("td", { className: "px-3 py-2 text-gray-700 dark:text-gray-300", children: v.fecha_fin }), _jsx("td", { className: "px-3 py-2 text-gray-700 dark:text-gray-300", children: v.dias }), _jsx("td", { className: "px-3 py-2 text-gray-500 dark:text-gray-400", children: v.descripcion ?? '—' }), _jsx("td", { className: "px-3 py-2", children: _jsx("button", { onClick: () => eliminarVac.mutate(v.id), className: "text-red-500 hover:underline", children: "Eliminar" }) })] }, v.id))) })] }) })] })] })] }) })), vacModalOpen && (_jsx("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm", children: [_jsx("div", { className: "px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800", children: _jsx("h3", { className: "text-base font-semibold text-gray-900 dark:text-white", children: "Agregar per\u00EDodo de vacaciones" }) }), _jsxs("form", { onSubmit: ev => { ev.preventDefault(); guardarVac.mutate(vacForm); }, className: "px-6 py-4 space-y-3", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Fecha inicio *" }), _jsx("input", { type: "date", required: true, value: vacForm.fecha_inicio, onChange: e => {
                                                        const inicio = e.target.value;
                                                        const dias = calcDias(inicio, vacForm.fecha_fin);
                                                        setVacForm(f => ({ ...f, fecha_inicio: inicio, dias: dias > 0 ? String(dias) : f.dias }));
                                                    }, className: INPUT_CLS })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Fecha fin *" }), _jsx("input", { type: "date", required: true, value: vacForm.fecha_fin, onChange: e => {
                                                        const fin = e.target.value;
                                                        const dias = calcDias(vacForm.fecha_inicio, fin);
                                                        setVacForm(f => ({ ...f, fecha_fin: fin, dias: dias > 0 ? String(dias) : f.dias }));
                                                    }, className: INPUT_CLS })] })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "D\u00EDas *" }), _jsx("input", { type: "number", required: true, min: "1", value: vacForm.dias, onChange: e => setVacForm(f => ({ ...f, dias: e.target.value })), className: INPUT_CLS })] }), _jsxs("div", { children: [_jsx("label", { className: LABEL_CLS, children: "Descripci\u00F3n" }), _jsx("input", { type: "text", placeholder: "Vacaciones de verano...", value: vacForm.descripcion, onChange: e => setVacForm(f => ({ ...f, descripcion: e.target.value })), className: INPUT_CLS })] }), vacError && _jsx("p", { className: "text-xs text-red-500", children: vacError }), _jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [_jsx("button", { type: "button", onClick: () => setVacModalOpen(false), className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: guardarVac.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: guardarVac.isPending ? 'Guardando...' : 'Guardar' })] })] })] }) }))] }));
}
