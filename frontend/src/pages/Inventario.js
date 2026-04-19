import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../lib/api';
const MOTIVO_LABELS = {
    conteo_fisico: 'Conteo físico',
    merma: 'Merma',
    correccion: 'Corrección',
    otro: 'Otro',
};
const TIPO_LABELS = {
    entrada: 'Entrada',
    salida: 'Salida',
    ajuste: 'Ajuste',
};
function MovimientoIcon({ tipo, signo }) {
    if (tipo === 'entrada' || (tipo === 'ajuste' && signo === 1))
        return _jsx(TrendingUp, { size: 14, className: "text-green-500" });
    return _jsx(TrendingDown, { size: 14, className: "text-red-500" });
}
function fmtFecha(iso) {
    return new Date(iso).toLocaleDateString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function ReferenciaCelda({ tipo, id }) {
    if (!tipo || !id)
        return _jsx("span", { className: "text-gray-400", children: "\u2014" });
    const map = {
        orden_compra: `/ordenes-compra/${id}`,
        nota_venta: `/notas-venta/${id}`,
    };
    const href = map[tipo];
    const label = tipo === 'orden_compra' ? `OC #${id}` : tipo === 'nota_venta' ? `NV #${id}` : `${tipo} #${id}`;
    if (href)
        return _jsx("a", { href: href, className: "text-blue-600 dark:text-blue-400 hover:underline text-sm", children: label });
    return _jsx("span", { className: "text-sm text-gray-600 dark:text-gray-400", children: label });
}
export default function Inventario() {
    const qc = useQueryClient();
    const [tab, setTab] = useState('stock');
    const [busqueda, setBusqueda] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [ajusteOpen, setAjusteOpen] = useState(false);
    const [ajusteProductoId, setAjusteProductoId] = useState('');
    const [ajusteCantidad, setAjusteCantidad] = useState('1');
    const [ajusteSigno, setAjusteSigno] = useState(1);
    const [ajusteMotivo, setAjusteMotivo] = useState('conteo_fisico');
    const [ajusteNota, setAjusteNota] = useState('');
    const [ajusteError, setAjusteError] = useState('');
    const { data: productos = [] } = useQuery({
        queryKey: ['productos', busqueda],
        queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
    });
    const params = new URLSearchParams();
    if (filtroTipo)
        params.set('tipo', filtroTipo);
    if (fechaDesde)
        params.set('fecha_desde', fechaDesde);
    if (fechaHasta)
        params.set('fecha_hasta', fechaHasta);
    params.set('page', '1');
    params.set('page_size', '100');
    const { data: movimientos } = useQuery({
        queryKey: ['movimientos', filtroTipo, fechaDesde, fechaHasta],
        queryFn: () => api.get(`/api/inventario/movimientos?${params}`).then(r => r.data),
        enabled: tab === 'movimientos',
    });
    const { data: stockBajo = [] } = useQuery({
        queryKey: ['stock-bajo'],
        queryFn: () => api.get('/api/inventario/stock-bajo').then(r => r.data),
    });
    const ajusteMut = useMutation({
        mutationFn: (payload) => api.post('/api/inventario/ajustes', payload).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['productos'] });
            qc.invalidateQueries({ queryKey: ['movimientos'] });
            qc.invalidateQueries({ queryKey: ['stock-bajo'] });
            setAjusteOpen(false);
            setAjusteProductoId('');
            setAjusteCantidad('1');
            setAjusteSigno(1);
            setAjusteMotivo('conteo_fisico');
            setAjusteNota('');
            setAjusteError('');
        },
        onError: (e) => setAjusteError(e?.response?.data?.detail ?? 'Error al guardar'),
    });
    function submitAjuste(e) {
        e.preventDefault();
        if (!ajusteProductoId) {
            setAjusteError('Selecciona un producto');
            return;
        }
        ajusteMut.mutate({
            producto_id: parseInt(ajusteProductoId),
            cantidad: parseInt(ajusteCantidad) || 1,
            signo: ajusteSigno,
            motivo: ajusteMotivo,
            nota: ajusteNota || null,
        });
    }
    return (_jsxs("div", { className: "p-6 max-w-7xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Inventario" }), _jsxs("button", { onClick: () => setAjusteOpen(true), className: "flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors", children: [_jsx(Plus, { size: 16 }), "Ajuste manual"] })] }), stockBajo.length > 0 && (_jsxs("div", { className: "mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2", children: [_jsx(AlertTriangle, { size: 16, className: "text-red-500 mt-0.5 flex-shrink-0" }), _jsxs("span", { className: "text-sm text-red-700 dark:text-red-300", children: [stockBajo.length, " producto", stockBajo.length > 1 ? 's' : '', " con stock cr\u00EDtico"] })] })), _jsx("div", { className: "flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700", children: ['stock', 'movimientos'].map(t => (_jsx("button", { onClick: () => setTab(t), className: `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`, children: t === 'stock' ? 'Stock actual' : 'Movimientos' }, t))) }), tab === 'stock' && (_jsxs("div", { children: [_jsx("div", { className: "mb-3", children: _jsx("input", { type: "text", placeholder: "Buscar por nombre o SKU...", value: busqueda, onChange: e => setBusqueda(e.target.value), className: "w-72 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" }) }), _jsx("div", { className: "overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Producto" }), _jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "SKU" }), _jsx("th", { className: "text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Stock m\u00EDnimo" }), _jsx("th", { className: "text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Stock actual" }), _jsx("th", { className: "text-center px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Estado" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200 dark:divide-gray-700", children: productos.map(p => {
                                        const critico = p.stock_actual < p.stock_minimo;
                                        return (_jsxs("tr", { className: "bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800", children: [_jsx("td", { className: "px-4 py-3 text-gray-900 dark:text-white", children: p.nombre }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: p.sku ?? '—' }), _jsx("td", { className: "px-4 py-3 text-right text-gray-700 dark:text-gray-300", children: p.stock_minimo }), _jsx("td", { className: `px-4 py-3 text-right font-semibold ${critico ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`, children: p.stock_actual }), _jsx("td", { className: "px-4 py-3 text-center", children: critico ? (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", children: [_jsx(AlertTriangle, { size: 10 }), " Cr\u00EDtico"] })) : (_jsx("span", { className: "inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", children: "OK" })) })] }, p.id));
                                    }) })] }) })] })), tab === 'movimientos' && (_jsxs("div", { children: [_jsxs("div", { className: "flex gap-2 mb-3 flex-wrap", children: [_jsxs("select", { value: filtroTipo, onChange: e => setFiltroTipo(e.target.value), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white", children: [_jsx("option", { value: "", children: "Todos los tipos" }), _jsx("option", { value: "entrada", children: "Entrada" }), _jsx("option", { value: "salida", children: "Salida" }), _jsx("option", { value: "ajuste", children: "Ajuste" })] }), _jsx("input", { type: "date", value: fechaDesde, onChange: e => setFechaDesde(e.target.value), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" }), _jsx("input", { type: "date", value: fechaHasta, onChange: e => setFechaHasta(e.target.value), className: "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" })] }), _jsx("div", { className: "overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Fecha" }), _jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Producto" }), _jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Tipo" }), _jsx("th", { className: "text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Cantidad" }), _jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Referencia" }), _jsx("th", { className: "text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium", children: "Usuario" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-200 dark:divide-gray-700", children: [(movimientos?.items ?? []).map((m) => (_jsxs("tr", { className: "bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800", children: [_jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap", children: fmtFecha(m.created_at) }), _jsx("td", { className: "px-4 py-3 text-gray-900 dark:text-white", children: m.producto?.nombre ?? `#${m.producto_id}` }), _jsx("td", { className: "px-4 py-3", children: _jsxs("span", { className: "flex items-center gap-1 text-gray-700 dark:text-gray-300", children: [_jsx(MovimientoIcon, { tipo: m.tipo, signo: m.signo }), TIPO_LABELS[m.tipo] ?? m.tipo, m.motivo && _jsxs("span", { className: "text-gray-400 dark:text-gray-500 text-xs", children: ["(", MOTIVO_LABELS[m.motivo] ?? m.motivo, ")"] })] }) }), _jsxs("td", { className: `px-4 py-3 text-right font-semibold ${m.signo === 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`, children: [m.signo === 1 ? '+' : '-', m.cantidad] }), _jsx("td", { className: "px-4 py-3", children: _jsx(ReferenciaCelda, { tipo: m.referencia_tipo, id: m.referencia_id }) }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400", children: m.usuario?.name ?? '—' })] }, m.id))), !movimientos?.items?.length && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-400", children: "Sin movimientos" }) }))] })] }) }), movimientos && movimientos.total > 100 && (_jsxs("p", { className: "mt-2 text-sm text-gray-500", children: ["Mostrando 100 de ", movimientos.total, " movimientos."] }))] })), ajusteOpen && (_jsx("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl w-full max-w-md shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700", children: [_jsx("h2", { className: "font-semibold text-gray-900 dark:text-white", children: "Ajuste manual de stock" }), _jsx("button", { onClick: () => { setAjusteOpen(false); setAjusteError(''); }, className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none", children: "\u00D7" })] }), _jsxs("form", { onSubmit: submitAjuste, className: "px-6 py-4 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Producto" }), _jsxs("select", { value: ajusteProductoId, onChange: e => setAjusteProductoId(e.target.value), required: true, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white", children: [_jsx("option", { value: "", children: "Seleccionar producto..." }), productos.map(p => (_jsxs("option", { value: p.id, children: [p.nombre, p.sku ? ` (${p.sku})` : ''] }, p.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Tipo de ajuste" }), _jsx("div", { className: "flex gap-4", children: [1, -1].map(s => (_jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer", children: [_jsx("input", { type: "radio", name: "signo", value: s, checked: ajusteSigno === s, onChange: () => setAjusteSigno(s) }), s === 1 ? 'Suma (entrada)' : 'Resta (salida)'] }, s))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Cantidad" }), _jsx("input", { type: "number", min: "1", value: ajusteCantidad, onChange: e => setAjusteCantidad(e.target.value), required: true, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Motivo" }), _jsxs("select", { value: ajusteMotivo, onChange: e => setAjusteMotivo(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white", children: [_jsx("option", { value: "conteo_fisico", children: "Conteo f\u00EDsico" }), _jsx("option", { value: "merma", children: "Merma" }), _jsx("option", { value: "correccion", children: "Correcci\u00F3n" }), _jsx("option", { value: "otro", children: "Otro" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1", children: "Nota (opcional)" }), _jsx("textarea", { value: ajusteNota, onChange: e => setAjusteNota(e.target.value), rows: 2, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" })] }), ajusteError && _jsx("p", { className: "text-red-600 text-sm", children: ajusteError }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: () => { setAjusteOpen(false); setAjusteError(''); }, className: "px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800", children: "Cancelar" }), _jsx("button", { type: "submit", disabled: ajusteMut.isPending, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50", children: ajusteMut.isPending ? 'Guardando...' : 'Guardar ajuste' })] })] })] }) }))] }));
}
