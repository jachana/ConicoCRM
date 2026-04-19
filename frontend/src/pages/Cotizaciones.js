import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Mail, Trash2, Eye } from 'lucide-react';
import { api } from '../lib/api';
const ESTADO_LABELS = {
    no_definido: 'Sin definir',
    abierta: 'Abierta',
    cerrada_fv: 'Cerrada (FV)',
    rechazada: 'Rechazada',
};
const ESTADO_COLORS = {
    no_definido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    abierta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    cerrada_fv: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};
export default function Cotizaciones() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [estado, setEstado] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [deleteId, setDeleteId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const [emailToast, setEmailToast] = useState(null);
    const params = new URLSearchParams();
    if (estado)
        params.set('estado', estado);
    if (fechaDesde)
        params.set('fecha_desde', fechaDesde);
    if (fechaHasta)
        params.set('fecha_hasta', fechaHasta);
    const { data: cotizaciones = [], isLoading } = useQuery({
        queryKey: ['cotizaciones', estado, fechaDesde, fechaHasta],
        queryFn: () => api.get(`/api/cotizaciones/?${params.toString()}`).then(r => r.data),
    });
    const deleteMut = useMutation({
        mutationFn: (id) => api.delete(`/api/cotizaciones/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cotizaciones'] });
            setDeleteId(null);
            setDeleteError('');
        },
        onError: (err) => {
            setDeleteError(err?.response?.data?.detail || 'Error al eliminar');
        },
    });
    const emailMut = useMutation({
        mutationFn: (id) => api.post(`/api/cotizaciones/${id}/email`),
        onSuccess: () => {
            setEmailToast({ msg: 'Email enviado correctamente', ok: true });
            setTimeout(() => setEmailToast(null), 3500);
        },
        onError: (err) => {
            setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false });
            setTimeout(() => setEmailToast(null), 4000);
        },
    });
    function abrirPdf(id) {
        window.open(`/api/cotizaciones/${id}/pdf`, '_blank');
    }
    function fmtMoney(n) {
        return `$ ${Math.round(n).toLocaleString('es-CL')}`;
    }
    return (_jsxs("div", { className: "p-6 max-w-7xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Cotizaciones" }), _jsxs("button", { onClick: () => navigate('/cotizaciones/nueva'), className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors", children: [_jsx(Plus, { size: 16 }), "Nueva cotizaci\u00F3n"] })] }), _jsxs("div", { className: "flex flex-wrap gap-3 mb-4", children: [_jsxs("select", { value: estado, onChange: e => setEstado(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white", children: [_jsx("option", { value: "", children: "Todos los estados" }), _jsx("option", { value: "no_definido", children: "Sin definir" }), _jsx("option", { value: "abierta", children: "Abierta" }), _jsx("option", { value: "cerrada_fv", children: "Cerrada (FV)" }), _jsx("option", { value: "rechazada", children: "Rechazada" })] }), _jsx("input", { type: "date", value: fechaDesde, onChange: e => setFechaDesde(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" }), _jsx("input", { type: "date", value: fechaHasta, onChange: e => setFechaHasta(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" })] }), isLoading ? (_jsx("div", { className: "text-gray-500 py-8 text-center", children: "Cargando..." })) : (_jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[900px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsx("tr", { children: ['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (_jsx("th", { className: "text-left px-4 py-3 font-medium", children: h }, h))) }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [cotizaciones.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-8 text-center text-gray-400", children: "Sin cotizaciones" }) })), cotizaciones.map(c => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsxs("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: ["COT-", String(c.numero).padStart(5, '0')] }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap", children: new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CL') }), _jsx("td", { className: "px-4 py-3 text-gray-900 dark:text-white", children: c.cliente?.nombre ?? '-' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.contacto ?? '-' }), _jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap", children: fmtMoney(c.total) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`, children: ESTADO_LABELS[c.estado] ?? c.estado }) }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: c.vendedor?.name ?? '-' }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => navigate(`/cotizaciones/${c.id}`), className: "p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors", title: "Ver/Editar", children: _jsx(Eye, { size: 15 }) }), _jsx("button", { onClick: () => abrirPdf(c.id), className: "p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors", title: "PDF", children: _jsx(FileText, { size: 15 }) }), _jsx("button", { onClick: () => emailMut.mutate(c.id), disabled: emailMut.isPending, className: "p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors", title: "Enviar email", children: _jsx(Mail, { size: 15 }) }), c.estado === 'no_definido' && (_jsx("button", { onClick: () => { setDeleteId(c.id); setDeleteError(''); }, className: "p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors", title: "Eliminar", children: _jsx(Trash2, { size: 15 }) }))] }) })] }, c.id)))] })] }) })), deleteId !== null && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-sm", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white mb-2", children: "\u00BFEliminar cotizaci\u00F3n?" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mb-4", children: "Esta acci\u00F3n no se puede deshacer." }), deleteError && _jsx("p", { className: "text-sm text-red-500 mb-3", children: deleteError }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => { setDeleteId(null); setDeleteError(''); }, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { onClick: () => deleteMut.mutate(deleteId), disabled: deleteMut.isPending, className: "px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: deleteMut.isPending ? 'Eliminando...' : 'Eliminar' })] })] }) })), emailToast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`, children: emailToast.msg }))] }));
}
