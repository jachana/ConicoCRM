import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/dashboard/WidgetGrid.tsx
import GridLayout from 'react-grid-layout';
import Widget from './Widget';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WidthProvider = GridLayout.WidthProvider;
const ResponsiveGrid = WidthProvider(GridLayout);
export default function WidgetGrid({ widgets, editMode, onLayoutChange, onConfigure, onRemove, }) {
    const layout = widgets.map(w => ({
        i: w.id,
        x: w.grid.x,
        y: w.grid.y,
        w: w.grid.w,
        h: w.grid.h,
        static: !editMode,
    }));
    function handleLayoutChange(newLayout) {
        const posMap = Object.fromEntries(newLayout.map(l => [l.i, l]));
        const updated = widgets.map(w => {
            const pos = posMap[w.id];
            if (!pos)
                return w;
            return { ...w, grid: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
        });
        onLayoutChange(updated);
    }
    return (_jsx(ResponsiveGrid, { className: "layout", layout: layout, cols: 12, rowHeight: 60, isDraggable: editMode, isResizable: editMode, onLayoutChange: handleLayoutChange, draggableHandle: ".drag-handle", children: widgets.map(w => (_jsxs("div", { className: editMode ? 'cursor-grab' : '', children: [editMode && (_jsx("div", { className: "drag-handle absolute top-0 left-0 right-0 h-6 cursor-grab z-10 opacity-0 hover:opacity-100 bg-indigo-500/20 rounded-t" })), _jsx(Widget, { widget: w, editMode: editMode, onConfigure: onConfigure, onRemove: onRemove })] }, w.id))) }));
}
