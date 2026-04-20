import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/dashboard/Widget.tsx
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Settings, X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { WIDGET_BY_TYPE } from './widgetCatalog';
function formatMoney(n) {
    return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}
function buildParams(w) {
    const p = new URLSearchParams();
    if (w.date_range !== 'custom') {
        const today = new Date();
        const from = new Date(today);
        if (w.date_range === 'today')
            from.setDate(today.getDate());
        else if (w.date_range === 'week')
            from.setDate(today.getDate() - today.getDay() + 1);
        else if (w.date_range === 'month')
            from.setDate(1);
        else if (w.date_range === 'quarter')
            from.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
        else if (w.date_range === 'year')
            from.setMonth(0, 1);
        p.set('date_from', from.toISOString().split('T')[0]);
        p.set('date_to', today.toISOString().split('T')[0]);
    }
    else {
        if (w.date_from)
            p.set('date_from', w.date_from);
        if (w.date_to)
            p.set('date_to', w.date_to);
    }
    p.set('limit', String(w.limit));
    return p.toString();
}
// ── Chart renderers ────────────────────────────────────────────────────────────
function KpiCard({ value, label }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-1", children: [_jsx("span", { className: "text-3xl font-bold text-blue-500 dark:text-blue-400", children: value }), _jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: label })] }));
}
function SimpleBarChart({ data, xKey, yKey }) {
    return (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: data, margin: { top: 4, right: 8, bottom: 4, left: 0 }, children: [_jsx(XAxis, { dataKey: xKey, tick: { fontSize: 10 } }), _jsx(YAxis, { tick: { fontSize: 10 }, width: 50 }), _jsx(Tooltip, { formatter: (v) => formatMoney(v) }), _jsx(Bar, { dataKey: yKey, fill: "#6366f1", radius: [3, 3, 0, 0] })] }) }));
}
function SimpleLineChart({ data, xKey, yKey }) {
    return (_jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: data, margin: { top: 4, right: 8, bottom: 4, left: 0 }, children: [_jsx(XAxis, { dataKey: xKey, tick: { fontSize: 10 } }), _jsx(YAxis, { tick: { fontSize: 10 }, width: 50 }), _jsx(Tooltip, { formatter: (v) => formatMoney(v) }), _jsx(Line, { type: "monotone", dataKey: yKey, stroke: "#6366f1", dot: false, strokeWidth: 2 })] }) }));
}
// ── Per-widget render ──────────────────────────────────────────────────────────
function RenderVentas({ data, chart }) {
    if (chart === 'kpi')
        return _jsx(KpiCard, { value: formatMoney(data.total), label: "Ventas del per\u00EDodo" });
    if (chart === 'line')
        return _jsx(SimpleLineChart, { data: data.series, xKey: "periodo", yKey: "monto" });
    return _jsx(SimpleBarChart, { data: data.series, xKey: "periodo", yKey: "monto" });
}
function RenderCotizaciones({ data, chart }) {
    if (chart === 'kpi')
        return _jsx(KpiCard, { value: String(data.total), label: "Cotizaciones abiertas" });
    return _jsx(SimpleBarChart, { data: data.por_estado, xKey: "estado", yKey: "count" });
}
function RenderTopClientes({ data, chart }) {
    if (chart === 'bar')
        return _jsx(SimpleBarChart, { data: data, xKey: "nombre", yKey: "total" });
    return (_jsx("div", { className: "overflow-auto h-full", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "Cliente" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Total" })] }) }), _jsx("tbody", { children: data.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-1 px-2 truncate max-w-[150px] dark:text-gray-200", children: r.nombre }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: formatMoney(r.total) })] }, i))) })] }) }));
}
function RenderTopProductos({ data, chart }) {
    if (chart === 'bar')
        return _jsx(SimpleBarChart, { data: data, xKey: "nombre", yKey: "total" });
    return (_jsx("div", { className: "overflow-auto h-full", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "Producto" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Cant." }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Total" })] }) }), _jsx("tbody", { children: data.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-1 px-2 truncate max-w-[120px] dark:text-gray-200", children: r.nombre }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: r.cantidad }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: formatMoney(r.total) })] }, i))) })] }) }));
}
function RenderStockCritico({ data }) {
    return (_jsx("div", { className: "overflow-auto h-full", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "Producto" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Actual" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "M\u00EDnimo" })] }) }), _jsx("tbody", { children: data.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-1 px-2 truncate max-w-[130px] dark:text-gray-200", children: r.nombre }), _jsx("td", { className: "py-1 px-2 text-right text-red-600 font-medium dark:text-gray-200", children: r.stock_actual }), _jsx("td", { className: "py-1 px-2 text-right text-gray-500 dark:text-gray-400", children: r.stock_minimo })] }, i))) })] }) }));
}
function RenderNVPorCobrar({ data, chart }) {
    if (chart === 'kpi')
        return (_jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-1", children: [_jsx("span", { className: "text-3xl font-bold text-orange-500 dark:text-orange-400", children: formatMoney(data.total_monto) }), _jsxs("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: [data.count, " NV por cobrar"] })] }));
    return (_jsx("div", { className: "overflow-auto h-full", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "NV" }), _jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "Cliente" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Total" })] }) }), _jsx("tbody", { children: data.items.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsxs("td", { className: "py-1 px-2 dark:text-gray-200", children: ["#", r.numero] }), _jsx("td", { className: "py-1 px-2 truncate max-w-[120px] dark:text-gray-200", children: r.cliente }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: formatMoney(r.total) })] }, i))) })] }) }));
}
function RenderVendedorMetrica({ data, chart }) {
    if (chart === 'bar')
        return _jsx(SimpleBarChart, { data: data, xKey: "nombre", yKey: "total" });
    return (_jsx("div", { className: "overflow-auto h-full", children: _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "text-left py-1 px-2 text-gray-600 dark:text-gray-300", children: "Vendedor" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Docs" }), _jsx("th", { className: "text-right py-1 px-2 text-gray-600 dark:text-gray-300", children: "Total" })] }) }), _jsx("tbody", { children: data.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-1 px-2 dark:text-gray-200", children: r.nombre }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: r.count }), _jsx("td", { className: "py-1 px-2 text-right dark:text-gray-200", children: formatMoney(r.total) })] }, i))) })] }) }));
}
function WidgetContent({ widget, data }) {
    switch (widget.type) {
        case 'ventas_periodo': return _jsx(RenderVentas, { data: data, chart: widget.chart });
        case 'cotizaciones_abiertas': return _jsx(RenderCotizaciones, { data: data, chart: widget.chart });
        case 'top_clientes': return _jsx(RenderTopClientes, { data: data, chart: widget.chart });
        case 'top_productos': return _jsx(RenderTopProductos, { data: data, chart: widget.chart });
        case 'stock_critico': return _jsx(RenderStockCritico, { data: data });
        case 'nv_por_cobrar': return _jsx(RenderNVPorCobrar, { data: data, chart: widget.chart });
        case 'cotizaciones_por_vendedor':
        case 'ventas_por_vendedor': return _jsx(RenderVendedorMetrica, { data: data, chart: widget.chart });
        default: return _jsx("div", { className: "text-xs text-gray-400", children: "Widget desconocido" });
    }
}
export default function Widget({ widget, editMode, onConfigure, onRemove }) {
    const def = WIDGET_BY_TYPE[widget.type];
    const params = buildParams(widget);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['widget-data', widget.type, params],
        queryFn: () => api.get(`/api/dashboard/data/${widget.type}?${params}`).then(r => r.data),
    });
    return (_jsxs("div", { className: "bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0", children: [_jsx("span", { className: "text-xs font-medium text-gray-600 dark:text-gray-300 truncate", children: def.label }), editMode && (_jsxs("div", { className: "flex gap-1 flex-shrink-0 ml-2", children: [_jsx("button", { onClick: () => onConfigure(widget.id), className: "p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200", children: _jsx(Settings, { size: 13 }) }), _jsx("button", { onClick: () => onRemove(widget.id), className: "p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500", children: _jsx(X, { size: 13 }) })] }))] }), _jsxs("div", { className: "flex-1 p-2 min-h-0", children: [isLoading && (_jsx("div", { className: "flex items-center justify-center h-full", children: _jsx(Loader2, { size: 20, className: "animate-spin text-gray-400" }) })), isError && (_jsx("div", { className: "flex items-center justify-center h-full text-xs text-red-400", children: "Error al cargar datos" })), data && _jsx(WidgetContent, { widget: widget, data: data })] })] }));
}
