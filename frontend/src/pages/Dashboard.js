import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// frontend/src/pages/Dashboard.tsx
import { useState, useRef } from 'react';
import { Pencil, Save, X, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import WidgetGrid from '../components/dashboard/WidgetGrid';
import WidgetPicker from '../components/dashboard/WidgetPicker';
import WidgetConfigModal from '../components/dashboard/WidgetConfig';
import { TEMPLATES, applyTemplate } from '../components/dashboard/widgetCatalog';
export default function Dashboard() {
    const user = useAuthStore(s => s.user);
    const role = user?.role ?? 'vendedor';
    const isAdmin = role === 'admin';
    const { query, save } = useDashboardLayout(role);
    const [editMode, setEditMode] = useState(false);
    const [widgets, setWidgets] = useState([]);
    const [configuringId, setConfiguringId] = useState(null);
    const [toast, setToast] = useState(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const savedWidgetsRef = useRef([]);
    const layoutWidgets = query.data?.layout.widgets ?? [];
    function showToast(msg, ok = true) {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    }
    function enterEdit() {
        savedWidgetsRef.current = [...layoutWidgets];
        setWidgets([...layoutWidgets]);
        setEditMode(true);
    }
    function cancelEdit() {
        setWidgets([]);
        setEditMode(false);
    }
    async function saveLayout() {
        await save.mutateAsync({ widgets });
        setEditMode(false);
        setWidgets([]);
        showToast('Layout guardado');
    }
    function handleLayoutChange(updated) {
        setWidgets(updated);
    }
    function handleAdd(widget) {
        setWidgets(prev => [...prev, widget]);
    }
    function handleRemove(id) {
        setWidgets(prev => prev.filter(w => w.id !== id));
    }
    function handleConfigure(id) {
        setConfiguringId(id);
    }
    function handleSaveConfig(updated) {
        setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w));
    }
    function applyTempl(templateName) {
        const tmpl = TEMPLATES.find(t => t.name === templateName);
        if (!tmpl)
            return;
        setWidgets(applyTemplate(tmpl, isAdmin));
        setShowTemplates(false);
    }
    const activeWidgets = editMode ? widgets : layoutWidgets;
    if (query.isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center h-64 text-gray-400", children: "Cargando dashboard\u2026" }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0", children: [_jsx("h1", { className: "text-lg font-semibold text-gray-800 dark:text-gray-100", children: "Dashboard" }), _jsxs("div", { className: "flex items-center gap-2", children: [isAdmin && !editMode && (_jsxs("button", { onClick: enterEdit, className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700", children: [_jsx(Pencil, { size: 13 }), " Editar dashboard"] })), editMode && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative", children: [_jsxs("button", { onClick: () => setShowTemplates(v => !v), className: "flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: ["Templates ", _jsx(ChevronDown, { size: 12 })] }), showTemplates && (_jsx("div", { className: "absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-20 min-w-[140px]", children: TEMPLATES.map(t => (_jsx("button", { onClick: () => applyTempl(t.name), className: "block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: t.name }, t.name))) }))] }), _jsxs("button", { onClick: cancelEdit, className: "flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: [_jsx(X, { size: 13 }), " Cancelar"] }), _jsxs("button", { onClick: saveLayout, disabled: save.isPending, className: "flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50", children: [_jsx(Save, { size: 13 }), " ", save.isPending ? 'Guardando…' : 'Guardar'] })] }))] })] }), toast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-sm text-white z-50 ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`, children: toast.msg })), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx("div", { className: "flex-1 overflow-auto p-4", children: activeWidgets.length === 0 ? (_jsx("div", { className: "flex flex-col items-center justify-center h-64 text-gray-400 gap-2", children: _jsx("p", { className: "text-sm", children: isAdmin ? 'No hay widgets. Hacé clic en "Editar dashboard" para agregar.' : 'El dashboard aún no tiene widgets configurados.' }) })) : (_jsx(WidgetGrid, { widgets: activeWidgets, editMode: editMode, onLayoutChange: handleLayoutChange, onConfigure: handleConfigure, onRemove: handleRemove })) }), editMode && (_jsx(WidgetPicker, { isAdmin: isAdmin, onAdd: handleAdd }))] }), configuringId && (() => {
                const w = widgets.find(x => x.id === configuringId);
                if (!w)
                    return null;
                return (_jsx(WidgetConfigModal, { widget: w, onSave: handleSaveConfig, onClose: () => setConfiguringId(null) }));
            })()] }));
}
