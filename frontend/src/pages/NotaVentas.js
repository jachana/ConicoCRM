import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Eye, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
const ESTADO_LABELS = {
    pendiente: 'Pendiente',
    despachada: 'Despachada',
    entregada: 'Entregada',
    pagada: 'Pagada',
    cancelada: 'Cancelada',
};
const ESTADO_COLORS = {
    pendiente: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    despachada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    entregada: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    pagada: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cancelada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};
export default function NotaVentas() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [estado, setEstado] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [deleteId, setDeleteId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const params = new URLSearchParams();
    if (estado)
        params.set('estado', estado);
    if (fechaDesde)
        params.set('fecha_desde', fechaDesde);
    if (fechaHasta)
        params.set('fecha_hasta', fechaHasta);
    const { data: nvs = [], isLoading } = useQuery({
        queryKey: ['nota_ventas', estado, fechaDesde, fechaHasta],
        queryFn: () => api.get(`/api/nota_ventas/?${params.toString()}`).then(r => r.data),
    });
    const deleteMut = useMutation({
        mutationFn: (id) => api.delete(`/api/nota_ventas/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['nota_ventas'] }); setDeleteId(null); setDeleteError(''); },
        onError: (err) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
    });
    function fmtMoney(n) {
        return `$ ${Math.round(n).toLocaleString('es-CL')}`;
    }
    return (_jsxs("div", { className: "p-6 max-w-7xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Notas de Venta" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => window.open('/api/nota_ventas/export/excel', '_blank'), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Excel" }), _jsxs("button", { onClick: () => navigate('/notas-venta/nueva'), className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors", children: [_jsx(Plus, { size: 16 }), "Nueva NV"] })] })] }), _jsxs("div", { className: "flex flex-wrap gap-3 mb-4", children: [_jsxs("select", { value: estado, onChange: e => setEstado(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white", children: [_jsx("option", { value: "", children: "Todos los estados" }), Object.entries(ESTADO_LABELS).map(([v, l]) => (_jsx("option", { value: v, children: l }, v)))] }), _jsx("input", { type: "date", value: fechaDesde, onChange: e => setFechaDesde(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" }), _jsx("input", { type: "date", value: fechaHasta, onChange: e => setFechaHasta(e.target.value), className: "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" })] }), isLoading ? (_jsx("div", { className: "text-gray-500 py-8 text-center", children: "Cargando..." })) : (_jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[800px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsx("tr", { children: ['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (_jsx("th", { className: "text-left px-4 py-3 font-medium", children: h }, h))) }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [nvs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-8 text-center text-gray-400", children: "Sin notas de venta" }) })), nvs.map(nv => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsxs("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: ["NV-", String(nv.numero).padStart(5, '0')] }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap", children: new Date(nv.fecha + 'T00:00:00').toLocaleDateString('es-CL') }), _jsx("td", { className: "px-4 py-3 text-gray-900 dark:text-white", children: nv.cliente?.nombre ?? '-' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: nv.contacto ?? '-' }), _jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap", children: fmtMoney(nv.total) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`, children: ESTADO_LABELS[nv.estado] ?? nv.estado }) }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: nv.vendedor?.name ?? '-' }), _jsx("td", { className: "px-4 py-3", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => navigate(`/notas-venta/${nv.id}`), className: "p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors", title: "Ver/Editar", children: _jsx(Eye, { size: 15 }) }), _jsx("button", { onClick: () => window.open(`/api/nota_ventas/${nv.id}/pdf`, '_blank'), className: "p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors", title: "PDF", children: _jsx(FileText, { size: 15 }) }), nv.estado === 'pendiente' && (_jsx("button", { onClick: () => { setDeleteId(nv.id); setDeleteError(''); }, className: "p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors", title: "Eliminar", children: _jsx(Trash2, { size: 15 }) }))] }) })] }, nv.id)))] })] }) })), deleteId !== null && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-sm", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white mb-2", children: "\u00BFEliminar nota de venta?" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mb-4", children: "Esta acci\u00F3n no se puede deshacer." }), deleteError && _jsx("p", { className: "text-sm text-red-500 mb-3", children: deleteError }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => { setDeleteId(null); setDeleteError(''); }, className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white", children: "Cancelar" }), _jsx("button", { onClick: () => deleteMut.mutate(deleteId), disabled: deleteMut.isPending, className: "px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: deleteMut.isPending ? 'Eliminando...' : 'Eliminar' })] })] }) }))] }));
}
