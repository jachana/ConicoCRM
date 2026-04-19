import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/dashboard/WidgetPicker.tsx
import { Plus } from 'lucide-react';
import { WIDGET_CATALOG, makeWidget } from './widgetCatalog';
export default function WidgetPicker({ isAdmin, onAdd }) {
    const available = WIDGET_CATALOG.filter(def => isAdmin || !def.adminOnly);
    return (_jsxs("div", { className: "w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-3 overflow-y-auto", children: [_jsx("p", { className: "text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3", children: "Agregar widget" }), _jsx("div", { className: "flex flex-col gap-2", children: available.map(def => (_jsxs("button", { onClick: () => onAdd(makeWidget(def.type, def.chartTypes[0])), className: "flex items-center gap-2 w-full text-left px-2 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600", children: [_jsx(Plus, { size: 13, className: "flex-shrink-0 text-indigo-500" }), _jsx("span", { className: "truncate", children: def.label })] }, def.type))) })] }));
}
