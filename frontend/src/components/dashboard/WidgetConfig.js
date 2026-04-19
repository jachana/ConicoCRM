import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/dashboard/WidgetConfig.tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { WIDGET_BY_TYPE } from './widgetCatalog';
const CHART_LABELS = {
    kpi: 'KPI (número)',
    bar: 'Barras',
    line: 'Línea',
    table: 'Tabla',
};
const DATE_RANGE_LABELS = {
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes',
    quarter: 'Este trimestre',
    year: 'Este año',
    custom: 'Personalizado',
};
export default function WidgetConfigModal({ widget, onSave, onClose }) {
    const def = WIDGET_BY_TYPE[widget.type];
    const [draft, setDraft] = useState({ ...widget });
    function set(key, value) {
        setDraft(prev => ({ ...prev, [key]: value }));
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { className: "bg-white dark:bg-gray-800 rounded-lg shadow-xl w-80 p-5", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h3", { className: "font-semibold text-gray-800 dark:text-gray-100 text-sm", children: def.label }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1", children: "Tipo de gr\u00E1fico" }), _jsx("select", { value: draft.chart, onChange: e => set('chart', e.target.value), className: "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200", children: def.chartTypes.map(ct => (_jsx("option", { value: ct, children: CHART_LABELS[ct] }, ct))) })] }), def.hasDateRange && (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1", children: "Per\u00EDodo" }), _jsx("select", { value: draft.date_range, onChange: e => set('date_range', e.target.value), className: "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200", children: Object.keys(DATE_RANGE_LABELS).map(dr => (_jsx("option", { value: dr, children: DATE_RANGE_LABELS[dr] }, dr))) })] })), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1", children: "L\u00EDmite de filas" }), _jsx("input", { type: "number", min: 1, max: 50, value: draft.limit, onChange: e => set('limit', Number(e.target.value)), className: "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-2 py-1.5 text-gray-700 dark:text-gray-200" })] })] }), _jsxs("div", { className: "flex gap-2 mt-5", children: [_jsx("button", { onClick: onClose, className: "flex-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700", children: "Cancelar" }), _jsx("button", { onClick: () => { onSave(draft); onClose(); }, className: "flex-1 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700", children: "Guardar" })] })] }) }));
}
