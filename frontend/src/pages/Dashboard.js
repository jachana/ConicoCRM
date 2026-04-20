import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// frontend/src/pages/Dashboard.tsx
import { useState, useEffect, useRef } from 'react';
import { Pencil, Save, X, ChevronDown, Plus, Trash2, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useDashboardPresets } from '../hooks/useDashboardPresets';
import WidgetGrid from '../components/dashboard/WidgetGrid';
import WidgetPicker from '../components/dashboard/WidgetPicker';
import WidgetConfigModal from '../components/dashboard/WidgetConfig';
import { TEMPLATES, applyTemplate } from '../components/dashboard/widgetCatalog';
import Widget from '../components/dashboard/Widget';
export default function Dashboard() {
    const user = useAuthStore(s => s.user);
    const role = user?.role ?? 'vendedor';
    const isAdmin = role === 'admin';
    const { query, create, save, remove } = useDashboardPresets(role);
    const presets = query.data ?? [];
    const [activeSlot, setActiveSlot] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editName, setEditName] = useState('');
    const [editWidgets, setEditWidgets] = useState([]);
    const [configuringId, setConfiguringId] = useState(null);
    const [toast, setToast] = useState(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    const nameInputRef = useRef(null);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    useEffect(() => {
        if (presets.length > 0 && activeSlot === null) {
            setActiveSlot(presets[0].slot);
        }
    }, [presets, activeSlot]);
    const currentPreset = presets.find(p => p.slot === activeSlot) ?? presets[0] ?? null;
    const viewWidgets = currentPreset?.layout.widgets ?? [];
    function showToast(msg, ok = true) {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    }
    function enterEdit() {
        if (!currentPreset)
            return;
        setEditName(currentPreset.name);
        setEditWidgets([...currentPreset.layout.widgets]);
        setEditMode(true);
        setTimeout(() => nameInputRef.current?.focus(), 50);
    }
    function cancelEdit() {
        setEditMode(false);
        setEditName('');
        setEditWidgets([]);
        setShowTemplates(false);
    }
    async function saveEdit() {
        if (!currentPreset)
            return;
        try {
            await save.mutateAsync({
                slot: currentPreset.slot,
                name: editName.trim() || currentPreset.name,
                layout: { widgets: editWidgets },
            });
            setEditMode(false);
            setEditName('');
            setEditWidgets([]);
            showToast('Dashboard guardado');
        }
        catch {
            showToast('Error al guardar', false);
        }
    }
    async function handleCreatePreset() {
        try {
            const res = await create.mutateAsync({ name: `Dashboard ${presets.length + 1}` });
            setActiveSlot(res.slot);
            setEditName(res.name);
            setEditWidgets([]);
            setEditMode(true);
            setTimeout(() => nameInputRef.current?.select(), 50);
        }
        catch {
            showToast('Error al crear dashboard', false);
        }
    }
    async function handleDeletePreset() {
        if (!currentPreset || presets.length <= 1)
            return;
        try {
            await remove.mutateAsync(currentPreset.slot);
            const remaining = presets.filter(p => p.slot !== currentPreset.slot);
            setActiveSlot(remaining[0]?.slot ?? null);
            cancelEdit();
        }
        catch {
            showToast('Error al eliminar dashboard', false);
        }
    }
    function applyTempl(templateName) {
        const tmpl = TEMPLATES.find(t => t.name === templateName);
        if (!tmpl)
            return;
        setEditWidgets(applyTemplate(tmpl, isAdmin));
        setShowTemplates(false);
    }
    const activeWidgets = editMode ? editWidgets : viewWidgets;
    const sortedMobile = [...activeWidgets].sort((a, b) => a.grid.y - b.grid.y || a.grid.x - b.grid.x);
    if (query.isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center h-64 text-gray-400", children: _jsx(Loader2, { size: 24, className: "animate-spin" }) }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 gap-2", children: [_jsx("h1", { className: "text-base md:text-lg font-semibold text-gray-800 dark:text-gray-100 flex-shrink-0", children: "Dashboard" }), _jsxs("div", { className: "flex items-center gap-1.5 flex-wrap justify-end", children: [isAdmin && !editMode && !isMobile && (_jsxs("button", { onClick: enterEdit, disabled: !currentPreset, className: "flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-40", children: [_jsx(Pencil, { size: 13 }), " Editar"] })), editMode && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative", children: [_jsxs("button", { onClick: () => setShowTemplates(v => !v), className: "flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: ["Templates ", _jsx(ChevronDown, { size: 12 })] }), showTemplates && (_jsx("div", { className: "absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-20 min-w-[150px]", children: TEMPLATES.map(t => (_jsx("button", { onClick: () => applyTempl(t.name), className: "block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: t.name }, t.name))) }))] }), _jsxs("button", { onClick: cancelEdit, className: "flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700", children: [_jsx(X, { size: 13 }), " Cancelar"] }), _jsxs("button", { onClick: saveEdit, disabled: save.isPending, className: "flex items-center gap-1 px-2.5 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50", children: [_jsx(Save, { size: 13 }), " ", save.isPending ? 'Guardando…' : 'Guardar'] })] }))] })] }), _jsxs("div", { className: "flex items-center gap-1 px-4 md:px-6 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0", children: [presets.map(p => {
                        const isActive = p.slot === currentPreset?.slot;
                        const isEditingThis = editMode && isActive;
                        return (_jsx("button", { onClick: () => { if (!editMode)
                                setActiveSlot(p.slot); }, className: `
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0
                ${isActive
                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}
                ${editMode && !isActive ? 'opacity-40 cursor-not-allowed' : ''}
              `, children: isEditingThis ? (_jsx("input", { ref: nameInputRef, value: editName, onChange: e => setEditName(e.target.value), onClick: e => e.stopPropagation(), className: "bg-transparent border-b border-indigo-400 focus:outline-none w-28 min-w-0", maxLength: 50, placeholder: "Nombre\u2026" })) : (p.name) }, p.slot));
                    }), isAdmin && !editMode && presets.length < 5 && !isMobile && (_jsxs("button", { onClick: handleCreatePreset, disabled: create.isPending, className: "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0", children: [_jsx(Plus, { size: 13 }), _jsx("span", { className: "hidden sm:inline", children: "Nuevo" })] })), isAdmin && editMode && presets.length > 1 && (_jsxs("button", { onClick: handleDeletePreset, disabled: remove.isPending, className: "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex-shrink-0", children: [_jsx(Trash2, { size: 13 }), _jsx("span", { className: "hidden sm:inline", children: "Eliminar" })] }))] }), toast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-sm text-white z-50 ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`, children: toast.msg })), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx("div", { className: "flex-1 overflow-auto p-3 md:p-4", children: activeWidgets.length === 0 ? (_jsx("div", { className: "flex flex-col items-center justify-center h-64 text-gray-400 gap-2", children: _jsx("p", { className: "text-sm text-center px-4", children: isAdmin
                                    ? editMode
                                        ? 'Agrega widgets desde el panel derecho.'
                                        : 'Sin widgets. Hacé clic en "Editar" para configurar.'
                                    : 'El dashboard aún no tiene widgets configurados.' }) })) : isMobile ? (
                        /* Mobile: vertical stack, no drag */
                        _jsx("div", { className: "flex flex-col gap-3", children: sortedMobile.map(w => (_jsx("div", { style: { height: `${w.grid.h * 60}px`, maxHeight: '240px', minHeight: '120px' }, children: _jsx(Widget, { widget: w, editMode: false, onConfigure: () => { }, onRemove: () => { } }) }, w.id))) })) : (_jsx(WidgetGrid, { widgets: activeWidgets, editMode: editMode, onLayoutChange: setEditWidgets, onConfigure: setConfiguringId, onRemove: (id) => setEditWidgets(prev => prev.filter(w => w.id !== id)) })) }), editMode && !isMobile && (_jsx(WidgetPicker, { isAdmin: isAdmin, onAdd: w => setEditWidgets(prev => [...prev, w]) }))] }), configuringId && (() => {
                const w = editWidgets.find(x => x.id === configuringId);
                if (!w)
                    return null;
                return (_jsx(WidgetConfigModal, { widget: w, onSave: updated => setEditWidgets(prev => prev.map(x => x.id === updated.id ? updated : x)), onClose: () => setConfiguringId(null) }));
            })()] }));
}
