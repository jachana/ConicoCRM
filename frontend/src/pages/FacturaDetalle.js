import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { openPdf } from '../lib/pdf';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Mail, ArrowLeft, ExternalLink, Pencil, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
const ESTADO_LABELS = {
    emitida: 'Emitida',
    pagada: 'Pagada',
    anulada: 'Anulada',
};
const ESTADO_COLORS = {
    emitida: 'bg-blue-100 text-blue-700',
    pagada: 'bg-green-100 text-green-700',
    anulada: 'bg-red-100 text-red-700',
};
function getValidTransitions(estado) {
    const all = {
        emitida: ['pagada', 'anulada'],
        pagada: ['anulada'],
        anulada: [],
    };
    return all[estado] ?? [];
}
function fmtMoney(n) {
    return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}
function calcLinea(l) {
    const cantidad = Number(l.cantidad) || 0;
    const valor_neto = Number(l.valor_neto) || 0;
    const total_neto = cantidad * valor_neto;
    const iva = Math.round(total_neto * 0.19 * 100) / 100;
    const total = total_neto + iva;
    return { ...l, cantidad, valor_neto, total_neto, iva, total };
}
function PaymentModal({ onConfirm, onCancel, totalSugerido }) {
    const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
    const [montoPagado, setMontoPagado] = useState(totalSugerido);
    const [metodoPago, setMetodoPago] = useState('transferencia');
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-sm mx-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-base font-semibold text-gray-900 dark:text-white", children: "Registrar pago" }), _jsx("button", { onClick: onCancel, className: "p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha de pago" }), _jsx("input", { type: "date", value: fechaPago, onChange: e => setFechaPago(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Monto pagado" }), _jsx("input", { type: "number", min: "0", step: "1", value: montoPagado, onChange: e => setMontoPagado(parseFloat(e.target.value) || 0), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "M\u00E9todo de pago" }), _jsxs("select", { value: metodoPago, onChange: e => setMetodoPago(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", children: [_jsx("option", { value: "efectivo", children: "Efectivo" }), _jsx("option", { value: "transferencia", children: "Transferencia" }), _jsx("option", { value: "cheque", children: "Cheque" }), _jsx("option", { value: "debito", children: "D\u00E9bito" }), _jsx("option", { value: "credito", children: "Cr\u00E9dito" }), _jsx("option", { value: "deposito", children: "Dep\u00F3sito" })] })] })] }), _jsxs("div", { className: "flex gap-2 mt-5", children: [_jsx("button", { onClick: onCancel, className: "flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" }), _jsxs("button", { onClick: () => onConfirm({ fecha_pago: fechaPago, monto_pagado: montoPagado, metodo_pago: metodoPago }), className: "flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5", children: [_jsx(Check, { size: 14 }), "Confirmar pago"] })] })] }) }));
}
export default function FacturaDetalle() {
    const { id } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const currentUser = useAuthStore(s => s.user);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin';
    // Header edit state
    const [editing, setEditing] = useState(false);
    const [editingLineas, setEditingLineas] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [emailToast, setEmailToast] = useState(null);
    const [showEstadoMenu, setShowEstadoMenu] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    // Form fields
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState('');
    const [contacto, setContacto] = useState('');
    const [correo, setCorreo] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [nota, setNota] = useState('');
    const [empresaId, setEmpresaId] = useState('');
    const [lineas, setLineas] = useState([]);
    const { data: factura } = useQuery({
        queryKey: ['factura', id],
        queryFn: () => api.get(`/api/facturas/${id}`).then(r => r.data),
        enabled: !!id,
    });
    useEffect(() => {
        if (factura) {
            setClienteId(factura.cliente_id);
            setVendedorId(factura.vendedor_id ?? '');
            setContacto(factura.contacto ?? '');
            setCorreo(factura.correo ?? '');
            setFecha(factura.fecha);
            setFechaVencimiento(factura.fecha_vencimiento ?? '');
            setNota(factura.nota ?? '');
            setEmpresaId(factura.empresa_id ?? '');
            setLineas((factura.lineas ?? []).map((l, i) => ({
                ...l,
                _key: `${l.id ?? i}`,
            })));
        }
    }, [factura]);
    const { data: clientes = [] } = useQuery({
        queryKey: ['clientes'],
        queryFn: () => api.get('/api/clientes/').then(r => r.data),
        enabled: editing,
    });
    const { data: usuarios = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => api.get('/api/users').then(r => r.data),
        enabled: editing && isAdmin,
    });
    const { data: empresas = [] } = useQuery({
        queryKey: ['empresas'],
        queryFn: () => api.get('/api/empresas/').then(r => r.data),
        enabled: editing,
    });
    function updateLinea(idx, patch) {
        setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })));
    }
    const totalNeto = lineas.reduce((s, l) => s + (Number(l.total_neto) || 0), 0);
    const totalIva = lineas.reduce((s, l) => s + (Number(l.iva) || 0), 0);
    const total = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
    async function handleSave() {
        if (!clienteId) {
            setError('Selecciona un cliente');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                cliente_id: clienteId,
                vendedor_id: vendedorId || null,
                contacto: contacto || null,
                correo: correo || null,
                fecha,
                fecha_vencimiento: fechaVencimiento || null,
                nota: nota || null,
                empresa_id: empresaId || null,
            };
            await api.patch(`/api/facturas/${id}`, payload);
            if (editingLineas) {
                const lineasPayload = lineas.map((l, i) => ({
                    orden: i + 1,
                    producto_id: l.producto_id,
                    sku: l.sku,
                    descripcion: l.descripcion,
                    formato: l.formato,
                    cantidad: l.cantidad,
                    valor_neto: l.valor_neto,
                }));
                await api.put(`/api/facturas/${id}/lineas`, lineasPayload);
            }
            qc.invalidateQueries({ queryKey: ['factura', id] });
            qc.invalidateQueries({ queryKey: ['facturas'] });
            setEditing(false);
            setEditingLineas(false);
        }
        catch (err) {
            setError(err?.response?.data?.detail || 'Error al guardar');
        }
        finally {
            setSaving(false);
        }
    }
    function handleCancelEdit() {
        // Reset to server data
        if (factura) {
            setClienteId(factura.cliente_id);
            setVendedorId(factura.vendedor_id ?? '');
            setContacto(factura.contacto ?? '');
            setCorreo(factura.correo ?? '');
            setFecha(factura.fecha);
            setFechaVencimiento(factura.fecha_vencimiento ?? '');
            setNota(factura.nota ?? '');
            setEmpresaId(factura.empresa_id ?? '');
            setLineas((factura.lineas ?? []).map((l, i) => ({
                ...l,
                _key: `${l.id ?? i}`,
            })));
        }
        setEditing(false);
        setEditingLineas(false);
        setError('');
    }
    const estadoMut = useMutation({
        mutationFn: (payload) => api.patch(`/api/facturas/${id}/estado`, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['factura', id] });
            qc.invalidateQueries({ queryKey: ['facturas'] });
            setShowEstadoMenu(false);
            setShowPaymentModal(false);
        },
        onError: (err) => {
            setError(err?.response?.data?.detail || 'Error al cambiar estado');
            setShowEstadoMenu(false);
            setShowPaymentModal(false);
        },
    });
    const emailMut = useMutation({
        mutationFn: () => api.post(`/api/facturas/${id}/email`),
        onSuccess: () => {
            setEmailToast({ msg: 'Email enviado correctamente', ok: true });
            setTimeout(() => setEmailToast(null), 3500);
        },
        onError: (err) => {
            setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false });
            setTimeout(() => setEmailToast(null), 4000);
        },
    });
    const deleteMut = useMutation({
        mutationFn: () => api.delete(`/api/facturas/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['facturas'] });
            navigate('/facturas');
        },
        onError: (err) => {
            setError(err?.response?.data?.detail || 'Error al eliminar factura');
        },
    });
    function handleEstadoClick(nuevoEstado) {
        if (nuevoEstado === 'pagada') {
            setShowEstadoMenu(false);
            setShowPaymentModal(true);
        }
        else {
            estadoMut.mutate({ estado: nuevoEstado });
        }
    }
    function handlePaymentConfirm(data) {
        estadoMut.mutate({ estado: 'pagada', ...data });
    }
    const validTransitions = factura ? getValidTransitions(factura.estado) : [];
    const canDelete = factura?.estado === 'emitida';
    if (!factura) {
        return (_jsx("div", { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-3 mb-6", children: [_jsx("button", { onClick: () => navigate('/facturas'), className: "p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx("div", { className: "h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" })] }) }));
    }
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/facturas'), className: "p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors", children: _jsx(ArrowLeft, { size: 18 }) }), _jsxs("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: ["FAC-", String(factura.numero).padStart(5, '0')] }), _jsx("span", { className: `px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[factura.estado] ?? 'bg-gray-100 text-gray-700'}`, children: ESTADO_LABELS[factura.estado] ?? factura.estado })] }), _jsxs("div", { className: "flex items-center gap-2", children: [validTransitions.length > 0 && (_jsxs("div", { className: "relative", children: [_jsx("button", { onClick: () => setShowEstadoMenu(v => !v), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cambiar estado" }), showEstadoMenu && (_jsx("div", { className: "absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]", children: validTransitions.map(t => (_jsxs("button", { onClick: () => handleEstadoClick(t), className: "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg text-gray-700 dark:text-gray-300", children: ["\u2192 ", ESTADO_LABELS[t] ?? t] }, t))) }))] })), _jsxs("button", { onClick: () => openPdf(`/api/facturas/${id}/pdf`), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: [_jsx(FileText, { size: 15 }), "PDF"] }), _jsxs("button", { onClick: () => emailMut.mutate(), disabled: emailMut.isPending, className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50", children: [_jsx(Mail, { size: 15 }), emailMut.isPending ? 'Enviando...' : 'Email'] }), !editing ? (_jsxs("button", { onClick: () => setEditing(true), className: "flex items-center gap-2 px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors", children: [_jsx(Pencil, { size: 14 }), "Editar"] })) : (_jsxs(_Fragment, { children: [_jsx("button", { onClick: handleCancelEdit, className: "px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" }), _jsx("button", { onClick: handleSave, disabled: saving, className: "px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium", children: saving ? 'Guardando...' : 'Guardar' })] })), canDelete && (_jsx("button", { onClick: () => {
                                    if (window.confirm('¿Eliminar esta factura?'))
                                        deleteMut.mutate();
                                }, className: "px-3 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors", children: "Eliminar" }))] })] }), (factura.nv_id || factura.cotizacion_id) && (_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-4", children: [factura.nv_id && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: "Nota de venta:" }), _jsxs("button", { onClick: () => navigate(`/notas-venta/${factura.nv_id}`), className: "flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline", children: ["NV-", String(factura.nv?.numero ?? factura.nv_id).padStart(5, '0'), _jsx(ExternalLink, { size: 11 })] })] })), factura.cotizacion_id && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: "Cotizaci\u00F3n:" }), _jsxs("button", { onClick: () => navigate(`/cotizaciones/${factura.cotizacion_id}`), className: "flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline", children: ["COT-", String(factura.cotizacion?.numero ?? factura.cotizacion_id).padStart(5, '0'), _jsx(ExternalLink, { size: 11 })] })] }))] })), error && (_jsx("div", { className: "mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400", children: error })), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5", children: editing ? (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Cliente" }), _jsxs("select", { value: clienteId, onChange: e => setClienteId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", children: [_jsx("option", { value: "", children: "Seleccionar cliente..." }), clientes.map(c => (_jsxs("option", { value: c.id, children: [c.nombre, c.rut ? ` · ${c.rut}` : ''] }, c.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Empresa" }), _jsxs("select", { value: empresaId, onChange: e => setEmpresaId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", children: [_jsx("option", { value: "", children: "\u2014 Sin empresa \u2014" }), empresas.map(e => _jsx("option", { value: e.id, children: e.nombre }, e.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Contacto" }), _jsx("input", { type: "text", value: contacto, onChange: e => setContacto(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", placeholder: "Nombre del contacto" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Correo" }), _jsx("input", { type: "email", value: correo, onChange: e => setCorreo(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", placeholder: "email@ejemplo.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha emisi\u00F3n" }), _jsx("input", { type: "date", value: fecha, onChange: e => setFecha(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha vencimiento" }), _jsx("input", { type: "date", value: fechaVencimiento, onChange: e => setFechaVencimiento(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" })] }), isAdmin && (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Vendedor" }), _jsxs("select", { value: vendedorId, onChange: e => setVendedorId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500", children: [_jsx("option", { value: "", children: "\u2014 Sin asignar \u2014" }), usuarios.map(u => _jsx("option", { value: u.id, children: u.name }, u.id))] })] })), _jsxs("div", { className: "sm:col-span-2 lg:col-span-3", children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Nota / Observaciones" }), _jsx("textarea", { value: nota, onChange: e => setNota(e.target.value), rows: 2, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none", placeholder: "Notas internas o para el cliente..." })] })] })) : (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3", children: [_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Cliente" }), _jsxs("span", { className: "text-sm text-gray-900 dark:text-white font-medium", children: [factura.cliente?.nombre ?? '—', factura.cliente?.rut ? _jsxs("span", { className: "text-gray-500 font-normal", children: [" \u00B7 ", factura.cliente.rut] }) : null] })] }), factura.empresa && (_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Empresa" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.empresa.nombre })] })), factura.contacto && (_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Contacto" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.contacto })] })), factura.correo && (_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Correo" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.correo })] })), _jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Fecha emisi\u00F3n" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.fecha })] }), factura.fecha_vencimiento && (_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Vencimiento" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.fecha_vencimiento })] })), factura.vendedor && (_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Vendedor" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white", children: factura.vendedor.name })] })), factura.nota && (_jsxs("div", { className: "sm:col-span-2 lg:col-span-3", children: [_jsx("span", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5", children: "Nota" }), _jsx("span", { className: "text-sm text-gray-900 dark:text-white whitespace-pre-line", children: factura.nota })] }))] })) }), factura.estado === 'pagada' && (_jsxs("div", { className: "bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800 p-4 mb-5", children: [_jsx("h3", { className: "text-sm font-semibold text-green-800 dark:text-green-300 mb-2", children: "Informaci\u00F3n de pago" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5", children: "Fecha de pago" }), _jsx("span", { className: "text-sm text-green-900 dark:text-green-200", children: factura.fecha_pago ?? '—' })] }), _jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5", children: "Monto pagado" }), _jsx("span", { className: "text-sm text-green-900 dark:text-green-200 font-medium", children: factura.monto_pagado != null ? fmtMoney(factura.monto_pagado) : '—' })] }), _jsxs("div", { children: [_jsx("span", { className: "block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5", children: "M\u00E9todo de pago" }), _jsx("span", { className: "text-sm text-green-900 dark:text-green-200 capitalize", children: factura.metodo_pago ?? '—' })] })] })] })), _jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-700 dark:text-gray-300", children: "L\u00EDneas" }), !editingLineas && currentUser?.role === 'admin' && (_jsxs("button", { onClick: () => { setEditingLineas(true); setEditing(true); }, className: "flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors", children: [_jsx(Pencil, { size: 12 }), "Editar l\u00EDneas"] }))] }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4", children: _jsxs("table", { className: "w-full text-sm min-w-[800px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-3 font-medium text-center w-10", children: "N\u00BA" }), _jsx("th", { className: "px-3 py-3 font-medium w-24", children: "SKU" }), _jsx("th", { className: "px-3 py-3 font-medium", children: "Descripci\u00F3n" }), _jsx("th", { className: "px-3 py-3 font-medium w-28", children: "Formato" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-20", children: "Cant." }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Valor Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-24", children: "IVA" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: [lineas.map((linea, idx) => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-2 text-center text-gray-500 dark:text-gray-400", children: idx + 1 }), _jsx("td", { className: "px-3 py-2", children: editingLineas ? (_jsx("input", { type: "text", value: linea.sku ?? '', onChange: e => updateLinea(idx, { sku: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500", placeholder: "SKU" })) : (_jsx("span", { className: "text-xs text-gray-700 dark:text-gray-300", children: linea.sku ?? '—' })) }), _jsx("td", { className: "px-3 py-2", children: editingLineas ? (_jsx("input", { type: "text", value: linea.descripcion, onChange: e => updateLinea(idx, { descripcion: e.target.value }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500", placeholder: "Descripci\u00F3n..." })) : (_jsx("span", { className: "text-xs text-gray-900 dark:text-white", children: linea.descripcion })) }), _jsx("td", { className: "px-3 py-2", children: editingLineas ? (_jsx("input", { type: "text", value: linea.formato ?? '', onChange: e => updateLinea(idx, { formato: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500", placeholder: "Formato" })) : (_jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: linea.formato ?? '—' })) }), _jsx("td", { className: "px-3 py-2 text-right", children: editingLineas ? (_jsx("input", { type: "number", min: "1", value: linea.cantidad, onChange: e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right" })) : (_jsx("span", { className: "text-xs text-gray-700 dark:text-gray-300", children: linea.cantidad })) }), _jsx("td", { className: "px-3 py-2 text-right", children: editingLineas ? (_jsx("input", { type: "number", min: "0", value: linea.valor_neto, onChange: e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right" })) : (_jsx("span", { className: "text-xs text-gray-700 dark:text-gray-300", children: fmtMoney(linea.valor_neto) })) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium", children: fmtMoney(linea.total_neto) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs", children: fmtMoney(linea.iva) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium", children: fmtMoney(linea.total) })] }, linea._key))), lineas.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500", children: "Sin l\u00EDneas" }) }))] })] }) }), _jsx("div", { className: "flex justify-end mb-6", children: _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 min-w-[260px]", children: _jsxs("div", { className: "space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "Total Neto" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalNeto) })] }), _jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "IVA (19%)" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalIva) })] }), _jsxs("div", { className: "flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 font-bold text-gray-900 dark:text-white text-base", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmtMoney(total) })] })] }) }) }), emailToast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`, children: emailToast.msg })), showPaymentModal && (_jsx(PaymentModal, { onConfirm: handlePaymentConfirm, onCancel: () => setShowPaymentModal(false), totalSugerido: factura.total }))] }));
}
