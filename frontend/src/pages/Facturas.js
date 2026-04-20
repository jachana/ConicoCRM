import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { api } from '../lib/api';
const ESTADO_COLORS = {
    emitida: 'bg-blue-100 text-blue-800',
    parcial: 'bg-amber-100 text-amber-800',
    pagada: 'bg-green-100 text-green-800',
    anulada: 'bg-red-100 text-red-800',
};
const ESTADO_LABELS = {
    emitida: 'Emitida',
    parcial: 'Parcial',
    pagada: 'Pagada',
    anulada: 'Anulada',
};
export default function Facturas() {
    const [estados, setEstados] = useState([]);
    const [estadoOpen, setEstadoOpen] = useState(false);
    const estadoRef = useRef(null);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    useEffect(() => {
        function handleClick(e) {
            if (estadoRef.current && !estadoRef.current.contains(e.target))
                setEstadoOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);
    const params = new URLSearchParams();
    estados.forEach(e => params.append('estado', e));
    if (fechaDesde)
        params.set('fecha_desde', fechaDesde);
    if (fechaHasta)
        params.set('fecha_hasta', fechaHasta);
    const { data: facturas = [], isLoading } = useQuery({
        queryKey: ['facturas', estados, fechaDesde, fechaHasta],
        queryFn: () => api.get(`/api/facturas/?${params.toString()}`).then((r) => r.data),
    });
    return (_jsxs("div", { className: "p-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900", children: "Facturas" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("a", { href: "/api/facturas/export/excel", className: "flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50", children: [_jsx(Download, { size: 16 }), " Excel"] }), _jsxs(Link, { to: "/facturas/nueva", className: "flex items-center gap-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700", children: [_jsx(Plus, { size: 16 }), " Nueva Factura"] })] })] }), _jsxs("div", { className: "flex gap-3 mb-4", children: [_jsxs("div", { ref: estadoRef, className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setEstadoOpen(o => !o), className: "flex items-center justify-between gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white min-w-[150px]", children: [_jsx("span", { className: "truncate", children: estados.length === 0 ? 'Todos los estados' : estados.map(e => ESTADO_LABELS[e] ?? e).join(', ') }), _jsx("svg", { className: "h-4 w-4 flex-shrink-0 text-gray-400", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z", clipRule: "evenodd" }) })] }), estadoOpen && (_jsxs("div", { className: "absolute z-20 mt-1 w-full min-w-[160px] bg-white border border-gray-200 rounded-md shadow-lg py-1", children: [[
                                        { value: 'emitida', label: 'Emitida' },
                                        { value: 'parcial', label: 'Parcial' },
                                        { value: 'pagada', label: 'Pagada' },
                                        { value: 'anulada', label: 'Anulada' },
                                    ].map(opt => (_jsxs("label", { className: "flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-900", children: [_jsx("input", { type: "checkbox", checked: estados.includes(opt.value), onChange: e => setEstados(prev => e.target.checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value)), className: "rounded border-gray-300" }), opt.label] }, opt.value))), estados.length > 0 && (_jsx("button", { onClick: () => setEstados([]), className: "w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 mt-1 pt-1.5", children: "Limpiar" }))] }))] }), _jsx("input", { type: "date", value: fechaDesde, onChange: (e) => setFechaDesde(e.target.value), className: "border border-gray-300 rounded-md px-3 py-1.5 text-sm" }), _jsx("input", { type: "date", value: fechaHasta, onChange: (e) => setFechaHasta(e.target.value), className: "border border-gray-300 rounded-md px-3 py-1.5 text-sm" })] }), isLoading ? (_jsx("div", { className: "text-center py-12 text-gray-500", children: "Cargando..." })) : (_jsx("div", { className: "bg-white rounded-lg border border-gray-200 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 border-b border-gray-200", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 font-medium text-gray-700", children: "N\u00BA" }), _jsx("th", { className: "text-left px-4 py-3 font-medium text-gray-700", children: "Fecha" }), _jsx("th", { className: "text-left px-4 py-3 font-medium text-gray-700", children: "Vencimiento" }), _jsx("th", { className: "text-left px-4 py-3 font-medium text-gray-700", children: "Cliente" }), _jsx("th", { className: "text-left px-4 py-3 font-medium text-gray-700", children: "Estado" }), _jsx("th", { className: "text-right px-4 py-3 font-medium text-gray-700", children: "Total" })] }) }), _jsxs("tbody", { children: [facturas.map((f) => (_jsxs("tr", { className: "border-b border-gray-100 hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3", children: _jsxs(Link, { to: `/facturas/${f.id}`, className: "text-indigo-600 hover:underline font-mono font-medium", children: ["FAC-", String(f.numero).padStart(5, '0')] }) }), _jsx("td", { className: "px-4 py-3 text-gray-600", children: f.fecha ? new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '—' }), _jsx("td", { className: "px-4 py-3 text-gray-600", children: f.fecha_vencimiento
                                                ? new Date(f.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-CL')
                                                : '—' }), _jsx("td", { className: "px-4 py-3 font-medium text-gray-900", children: f.cliente?.nombre ?? '—' }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? 'bg-gray-100 text-gray-600'}`, children: ESTADO_LABELS[f.estado] ?? f.estado }) }), _jsxs("td", { className: "px-4 py-3 text-right font-medium text-gray-900", children: ["$", f.total.toLocaleString('es-CL')] })] }, f.id))), facturas.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-12 text-center text-gray-500", children: "No hay facturas registradas" }) }))] })] }) }))] }));
}
