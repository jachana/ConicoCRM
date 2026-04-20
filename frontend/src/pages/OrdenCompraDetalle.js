import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { openPdf } from '../lib/pdf';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileText, Mail, ArrowLeft, PackageCheck } from 'lucide-react';
import { api } from '../lib/api';
function newLinea(orden) {
    return { _key: `${Date.now()}-${orden}`, orden, producto_id: null, sku: null, descripcion: '', cantidad: 1, cantidad_recibida: 0, valor_neto: 0, total_neto: 0, iva: 0, total: 0 };
}
function calcLinea(l) {
    const cantidad = Number(l.cantidad) || 0;
    const valor_neto = Number(l.valor_neto) || 0;
    const total_neto = cantidad * valor_neto;
    const iva = Math.round(total_neto * 0.19 * 100) / 100;
    return { ...l, total_neto, iva, total: total_neto + iva };
}
function fmtMoney(n) {
    return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}
const READONLY_ESTADOS = ['recibida_completa', 'cancelada'];
export default function OrdenCompraDetalle() {
    const { id } = useParams();
    const isNew = !id || id === 'nueva';
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [proveedorId, setProveedorId] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [fechaEntrega, setFechaEntrega] = useState('');
    const [nota, setNota] = useState('');
    const [lineas, setLineas] = useState([newLinea(1)]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [emailToast, setEmailToast] = useState(null);
    const [autocompleteIdx, setAutocompleteIdx] = useState(null);
    const [autocompleteResults, setAutocompleteResults] = useState([]);
    const [recepcionCantidades, setRecepcionCantidades] = useState({});
    const { data: orden } = useQuery({
        queryKey: ['orden_compra', id],
        queryFn: () => api.get(`/api/ordenes-compra/${id}`).then(r => r.data),
        enabled: !isNew,
    });
    useEffect(() => {
        if (orden) {
            setProveedorId(orden.proveedor_id);
            setFecha(orden.fecha);
            setFechaEntrega(orden.fecha_entrega_esperada ?? '');
            setNota(orden.nota ?? '');
            setLineas((orden.lineas ?? []).map((l, i) => ({ ...l, _key: `${l.id ?? i}`, producto_id: l.producto_id ?? null, sku: l.sku ?? null })));
            const initial = {};
            for (const l of orden.lineas ?? []) {
                if (l.id != null)
                    initial[l.id] = l.cantidad_recibida;
            }
            setRecepcionCantidades(initial);
        }
    }, [orden]);
    const { data: proveedores = [] } = useQuery({
        queryKey: ['proveedores'],
        queryFn: () => api.get('/api/proveedores/').then(r => r.data),
    });
    const estado = orden?.estado ?? 'borrador';
    const isReadonly = READONLY_ESTADOS.includes(estado);
    const canEdit = isNew || estado === 'borrador';
    const canReceive = estado === 'enviada' || estado === 'recibida_parcial';
    async function handleProductoSearch(idx, term) {
        if (!term || term.length < 2) {
            setAutocompleteResults([]);
            setAutocompleteIdx(null);
            return;
        }
        const r = await api.get(`/api/productos/?search=${encodeURIComponent(term)}`);
        setAutocompleteResults(r.data);
        setAutocompleteIdx(idx);
    }
    function seleccionarProducto(idx, producto) {
        setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, producto_id: producto.id, sku: producto.sku ?? null, descripcion: producto.nombre, valor_neto: producto.precio_costo })));
        setAutocompleteResults([]);
        setAutocompleteIdx(null);
    }
    function updateLinea(idx, field, value) {
        setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, [field]: value })));
    }
    function addLinea() {
        setLineas(prev => [...prev, newLinea(prev.length + 1)]);
    }
    function removeLinea(idx) {
        setLineas(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, orden: i + 1 })));
    }
    const totalNeto = lineas.reduce((s, l) => s + (Number(l.total_neto) || 0), 0);
    const totalIva = lineas.reduce((s, l) => s + (Number(l.iva) || 0), 0);
    const total = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
    async function guardar() {
        if (!proveedorId) {
            setError('Selecciona un proveedor');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const lineasPayload = lineas.map(l => ({
                orden: l.orden, producto_id: l.producto_id, sku: l.sku, descripcion: l.descripcion, cantidad: l.cantidad, valor_neto: l.valor_neto
            }));
            if (isNew) {
                const r = await api.post('/api/ordenes-compra/', { proveedor_id: proveedorId, fecha, fecha_entrega_esperada: fechaEntrega || null, nota: nota || null, lineas: lineasPayload });
                qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
                navigate(`/ordenes-compra/${r.data.id}`);
            }
            else {
                await api.patch(`/api/ordenes-compra/${id}`, { proveedor_id: proveedorId, fecha, fecha_entrega_esperada: fechaEntrega || null, nota: nota || null });
                await api.put(`/api/ordenes-compra/${id}/lineas`, lineasPayload);
                qc.invalidateQueries({ queryKey: ['orden_compra', id] });
                qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
            }
        }
        catch (e) {
            setError(e?.response?.data?.detail || 'Error al guardar');
        }
        finally {
            setSaving(false);
        }
    }
    const emailMut = useMutation({
        mutationFn: () => api.post(`/api/ordenes-compra/${id}/email`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['orden_compra', id] });
            qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
            setEmailToast({ msg: 'Email enviado. OC marcada como enviada.', ok: true });
            setTimeout(() => setEmailToast(null), 4000);
        },
        onError: (e) => {
            setEmailToast({ msg: e?.response?.data?.detail || 'Error al enviar email', ok: false });
            setTimeout(() => setEmailToast(null), 4000);
        },
    });
    const cancelarMut = useMutation({
        mutationFn: () => api.patch(`/api/ordenes-compra/${id}/estado`, { estado: 'cancelada' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['orden_compra', id] });
            qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
        },
        onError: (e) => setError(e?.response?.data?.detail || 'Error al cancelar'),
    });
    const recepcionarMut = useMutation({
        mutationFn: () => {
            const lineasPayload = Object.entries(recepcionCantidades).map(([linea_id, cantidad_recibida]) => ({
                id: Number(linea_id),
                cantidad_recibida,
            }));
            return api.post(`/api/ordenes-compra/${id}/recepcionar`, { lineas: lineasPayload });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['orden_compra', id] });
            qc.invalidateQueries({ queryKey: ['ordenes_compra'] });
        },
        onError: (e) => setError(e?.response?.data?.detail || 'Error al recepcionar'),
    });
    const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
    const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';
    // suppress unused var warning — isReadonly used as guard concept, canEdit covers both
    void isReadonly;
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [emailToast && (_jsx("div", { className: `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${emailToast.ok ? 'bg-green-600' : 'bg-red-600'}`, children: emailToast.msg })), _jsxs("div", { className: "flex items-center gap-3 mb-6", children: [_jsx("button", { onClick: () => navigate('/ordenes-compra'), className: "p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: isNew ? 'Nueva Orden de Compra' : `OC-${String(orden?.numero ?? '').padStart(5, '0')}` }), orden && (_jsx("span", { className: `ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${{ borrador: 'bg-gray-100 text-gray-600', enviada: 'bg-blue-100 text-blue-700', recibida_parcial: 'bg-yellow-100 text-yellow-700', recibida_completa: 'bg-green-100 text-green-700', cancelada: 'bg-red-100 text-red-700' }[estado] ?? ''}`, children: { borrador: 'Borrador', enviada: 'Enviada', recibida_parcial: 'Recibida parcial', recibida_completa: 'Recibida completa', cancelada: 'Cancelada' }[estado] }))] }), error && _jsx("div", { className: "mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm", children: error }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-5", children: _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "col-span-2 md:col-span-1", children: [_jsx("label", { className: labelCls, children: "Proveedor *" }), _jsxs("select", { value: proveedorId, onChange: e => setProveedorId(Number(e.target.value)), disabled: !canEdit, className: inputCls, children: [_jsx("option", { value: "", children: "Seleccionar proveedor..." }), proveedores.map(p => _jsx("option", { value: p.id, children: p.nombre }, p.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: labelCls, children: "Fecha" }), _jsx("input", { type: "date", value: fecha, onChange: e => setFecha(e.target.value), disabled: !canEdit, className: inputCls })] }), _jsxs("div", { children: [_jsx("label", { className: labelCls, children: "Entrega esperada" }), _jsx("input", { type: "date", value: fechaEntrega, onChange: e => setFechaEntrega(e.target.value), disabled: !canEdit, className: inputCls })] }), _jsxs("div", { className: "col-span-2", children: [_jsx("label", { className: labelCls, children: "Nota" }), _jsx("textarea", { value: nota, onChange: e => setNota(e.target.value), disabled: !canEdit, rows: 2, className: `${inputCls} resize-none` })] })] }) }), _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-5", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3", children: "L\u00EDneas" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "py-2 pr-3 text-left w-8", children: "N\u00BA" }), _jsx("th", { className: "py-2 pr-3 text-left", children: "Producto / Descripci\u00F3n" }), _jsx("th", { className: "py-2 pr-3 text-left w-24", children: "SKU" }), _jsx("th", { className: "py-2 pr-3 text-right w-16", children: "Cant." }), _jsx("th", { className: "py-2 pr-3 text-right w-28", children: "Valor Neto" }), _jsx("th", { className: "py-2 pr-3 text-right w-28", children: "Total Neto" }), _jsx("th", { className: "py-2 pr-3 text-right w-24", children: "IVA" }), _jsx("th", { className: "py-2 text-right w-28", children: "Total" }), canEdit && _jsx("th", { className: "py-2 w-8" })] }) }), _jsx("tbody", { children: lineas.map((l, idx) => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-2 pr-3 text-gray-400", children: idx + 1 }), _jsxs("td", { className: "py-2 pr-3 relative", children: [_jsx("input", { value: l.descripcion, onChange: e => { updateLinea(idx, 'descripcion', e.target.value); handleProductoSearch(idx, e.target.value); }, disabled: !canEdit, placeholder: "Descripci\u00F3n o buscar producto...", className: `${inputCls} w-full` }), autocompleteIdx === idx && autocompleteResults.length > 0 && (_jsx("div", { className: "absolute top-full left-0 z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto", children: autocompleteResults.map(p => (_jsxs("button", { type: "button", onClick: () => seleccionarProducto(idx, p), className: "w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white", children: [p.nombre, " ", p.sku ? `(${p.sku})` : ''] }, p.id))) }))] }), _jsx("td", { className: "py-2 pr-3", children: _jsx("input", { value: l.sku ?? '', onChange: e => updateLinea(idx, 'sku', e.target.value || null), disabled: !canEdit, className: inputCls, placeholder: "SKU" }) }), _jsx("td", { className: "py-2 pr-3", children: _jsx("input", { type: "number", min: 1, value: l.cantidad, onChange: e => updateLinea(idx, 'cantidad', Number(e.target.value)), disabled: !canEdit, className: `${inputCls} text-right` }) }), _jsx("td", { className: "py-2 pr-3", children: _jsx("input", { type: "number", min: 0, value: l.valor_neto, onChange: e => updateLinea(idx, 'valor_neto', Number(e.target.value)), disabled: !canEdit, className: `${inputCls} text-right` }) }), _jsx("td", { className: "py-2 pr-3 text-right text-gray-700 dark:text-gray-300", children: fmtMoney(l.total_neto) }), _jsx("td", { className: "py-2 pr-3 text-right text-gray-500", children: fmtMoney(l.iva) }), _jsx("td", { className: "py-2 text-right font-medium text-gray-900 dark:text-white", children: fmtMoney(l.total) }), canEdit && (_jsx("td", { className: "py-2 pl-2", children: _jsx("button", { onClick: () => removeLinea(idx), className: "p-1 text-red-400 hover:text-red-600", children: _jsx(Trash2, { size: 14 }) }) }))] }, l._key))) })] }) }), canEdit && (_jsxs("button", { onClick: addLinea, className: "mt-3 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline", children: [_jsx(Plus, { size: 14 }), " Agregar l\u00EDnea"] })), _jsx("div", { className: "mt-4 flex justify-end", children: _jsx("table", { className: "text-sm", children: _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { className: "pr-8 text-gray-500", children: "Total Neto" }), _jsx("td", { className: "text-right font-medium text-gray-900 dark:text-white", children: fmtMoney(totalNeto) })] }), _jsxs("tr", { children: [_jsx("td", { className: "pr-8 text-gray-500", children: "IVA (19%)" }), _jsx("td", { className: "text-right font-medium text-gray-900 dark:text-white", children: fmtMoney(totalIva) })] }), _jsxs("tr", { className: "border-t border-gray-200 dark:border-gray-700", children: [_jsx("td", { className: "pr-8 font-semibold text-gray-900 dark:text-white pt-2", children: "TOTAL" }), _jsx("td", { className: "text-right font-bold text-blue-600 dark:text-blue-400 pt-2", children: fmtMoney(total) })] })] }) }) })] }), _jsxs("div", { className: "flex flex-wrap gap-3 mb-5", children: [canEdit && (_jsx("button", { onClick: guardar, disabled: saving, className: "px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50", children: saving ? 'Guardando…' : 'Guardar' })), !isNew && estado === 'borrador' && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => emailMut.mutate(), disabled: emailMut.isPending, className: "flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50", children: [_jsx(Mail, { size: 16 }), " Enviar por Email"] }), _jsx("button", { onClick: () => { if (confirm('¿Cancelar esta orden?'))
                                    cancelarMut.mutate(); }, className: "px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20", children: "Cancelar OC" })] })), !isNew && (_jsxs("button", { onClick: () => openPdf(`/api/ordenes-compra/${id}/pdf`), className: "flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800", children: [_jsx(FileText, { size: 16 }), " Ver PDF"] }))] }), !isNew && canReceive && (_jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-yellow-200 dark:border-yellow-800 p-5", children: [_jsxs("h2", { className: "text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2", children: [_jsx(PackageCheck, { size: 16 }), " Recepci\u00F3n de mercader\u00EDa"] }), _jsxs("table", { className: "min-w-full text-sm mb-4", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700", children: [_jsx("th", { className: "py-2 pr-4 text-left", children: "Descripci\u00F3n" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "Pedido" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "Ya recibido" }), _jsx("th", { className: "py-2 text-right", children: "Recibir ahora" })] }) }), _jsx("tbody", { children: (orden?.lineas ?? []).map(l => (_jsxs("tr", { className: "border-b border-gray-100 dark:border-gray-800", children: [_jsx("td", { className: "py-2 pr-4", children: l.descripcion }), _jsx("td", { className: "py-2 pr-4 text-right", children: l.cantidad }), _jsx("td", { className: "py-2 pr-4 text-right text-green-600", children: l.cantidad_recibida }), _jsx("td", { className: "py-2 text-right", children: _jsx("input", { type: "number", min: l.cantidad_recibida, max: l.cantidad, value: l.id != null ? (recepcionCantidades[l.id] ?? l.cantidad_recibida) : l.cantidad_recibida, onChange: e => l.id != null && setRecepcionCantidades(prev => ({ ...prev, [l.id]: Number(e.target.value) })), className: "w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 text-sm text-right" }) })] }, l.id))) })] }), _jsxs("button", { onClick: () => recepcionarMut.mutate(), disabled: recepcionarMut.isPending, className: "flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700 disabled:opacity-50", children: [_jsx(PackageCheck, { size: 16 }), " Confirmar recepci\u00F3n"] })] }))] }));
}
