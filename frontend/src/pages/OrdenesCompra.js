import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, Eye, Download } from 'lucide-react';
import { api } from '../lib/api';
const ESTADO_LABELS = {
    borrador: 'Borrador',
    enviada: 'Enviada',
    recibida_parcial: 'Recibida parcial',
    recibida_completa: 'Recibida completa',
    cancelada: 'Cancelada',
};
const ESTADO_COLORS = {
    borrador: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    enviada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    recibida_parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    recibida_completa: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cancelada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};
function fmtMoney(n) {
    return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}
export default function OrdenesCompra() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [proveedorId, setProveedorId] = useState('');
    const [estado, setEstado] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [deleteId, setDeleteId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const params = new URLSearchParams();
    if (proveedorId)
        params.set('proveedor_id', proveedorId);
    if (estado)
        params.set('estado', estado);
    if (fechaDesde)
        params.set('fecha_desde', fechaDesde);
    if (fechaHasta)
        params.set('fecha_hasta', fechaHasta);
    const { data: ordenes = [], isLoading } = useQuery({
        queryKey: ['ordenes_compra', proveedorId, estado, fechaDesde, fechaHasta],
        queryFn: () => api.get(`/api/ordenes-compra/?${params.toString()}`).then(r => r.data),
    });
    const { data: proveedores = [] } = useQuery({
        queryKey: ['proveedores'],
        queryFn: () => api.get('/api/proveedores/').then(r => r.data),
    });
    const deleteMut = useMutation({
        mutationFn: (id) => api.delete(`/api/ordenes-compra/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
            setDeleteId(null);
            setDeleteError('');
        },
        onError: (err) => {
            setDeleteError(err?.response?.data?.detail || 'Error al eliminar');
        },
    });
    function abrirPdf(id) {
        window.open(`/api/ordenes-compra/${id}/pdf`, '_blank');
    }
    async function exportarExcel() {
        const r = await api.get('/api/ordenes-compra/export/excel', { responseType: 'blob' });
        const url = URL.createObjectURL(r.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ordenes_compra.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    }
    return (_jsxs("div", { className: "p-6 max-w-7xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "\u00D3rdenes de Compra" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: exportarExcel, className: "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800", children: [_jsx(Download, { size: 16 }), " Excel"] }), _jsxs("button", { onClick: () => navigate('/ordenes-compra/nueva'), className: "flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700", children: [_jsx(Plus, { size: 16 }), " Nueva OC"] })] })] }), _jsxs("div", { className: "flex flex-wrap gap-3 mb-4", children: [_jsxs("select", { value: proveedorId, onChange: e => setProveedorId(e.target.value), className: "text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5", children: [_jsx("option", { value: "", children: "Todos los proveedores" }), proveedores.map(p => (_jsx("option", { value: p.id, children: p.nombre }, p.id)))] }), _jsxs("select", { value: estado, onChange: e => setEstado(e.target.value), className: "text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5", children: [_jsx("option", { value: "", children: "Todos los estados" }), Object.entries(ESTADO_LABELS).map(([v, l]) => (_jsx("option", { value: v, children: l }, v)))] }), _jsx("input", { type: "date", value: fechaDesde, onChange: e => setFechaDesde(e.target.value), className: "text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5", placeholder: "Desde" }), _jsx("input", { type: "date", value: fechaHasta, onChange: e => setFechaHasta(e.target.value), className: "text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5", placeholder: "Hasta" })] }), isLoading ? (_jsx("p", { className: "text-gray-500 dark:text-gray-400 text-sm", children: "Cargando\u2026" })) : (_jsx("div", { className: "overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800", children: _jsx("tr", { children: ['Nº OC', 'Proveedor', 'Fecha', 'Entrega esperada', 'Estado', 'Total', 'Acciones'].map(h => (_jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider", children: h }, h))) }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900", children: [ordenes.map(o => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50", children: [_jsxs("td", { className: "px-4 py-3 font-mono text-blue-600 dark:text-blue-400", children: ["OC-", String(o.numero).padStart(5, '0')] }), _jsx("td", { className: "px-4 py-3 text-gray-900 dark:text-white", children: o.proveedor?.nombre ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-600 dark:text-gray-400", children: o.fecha }), _jsx("td", { className: "px-4 py-3 text-gray-600 dark:text-gray-400", children: o.fecha_entrega_esperada ?? '—' }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[o.estado] ?? ''}`, children: ESTADO_LABELS[o.estado] ?? o.estado }) }), _jsx("td", { className: "px-4 py-3 font-medium text-gray-900 dark:text-white", children: fmtMoney(o.total) }), _jsx("td", { className: "px-4 py-3", children: deleteId === o.id ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-red-600 dark:text-red-400 text-xs", children: deleteError || '¿Eliminar?' }), _jsx("button", { onClick: () => deleteMut.mutate(o.id), className: "text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700", children: "S\u00ED" }), _jsx("button", { onClick: () => { setDeleteId(null); setDeleteError(''); }, className: "text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800", children: "No" })] })) : (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => navigate(`/ordenes-compra/${o.id}`), className: "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400", title: "Ver", children: _jsx(Eye, { size: 16 }) }), _jsx("button", { onClick: () => abrirPdf(o.id), className: "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400", title: "PDF", children: _jsx(FileText, { size: 16 }) }), o.estado === 'borrador' && (_jsx("button", { onClick: () => setDeleteId(o.id), className: "p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400", title: "Eliminar", children: _jsx(Trash2, { size: 16 }) }))] })) })] }, o.id))), ordenes.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-8 text-center text-gray-400 dark:text-gray-600", children: "No hay \u00F3rdenes de compra" }) }))] })] }) }))] }));
}
