import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X, Check, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
const METODOS_PAGO = ['efectivo', 'transferencia', 'cheque', 'debito', 'credito', 'deposito'];
function fmtMoney(n) {
    return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}
export default function Pagos() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const currentUser = useAuthStore(s => s.user);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin';
    const [showModal, setShowModal] = useState(false);
    const [facturaId, setFacturaId] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [monto, setMonto] = useState('');
    const [metodo, setMetodo] = useState('transferencia');
    const [nota, setNota] = useState('');
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const { data: pagos = [], isLoading } = useQuery({
        queryKey: ['pagos'],
        queryFn: () => api.get('/api/pagos/').then(r => r.data),
    });
    const { data: facturas = [] } = useQuery({
        queryKey: ['facturas'],
        queryFn: () => api.get('/api/facturas/').then(r => r.data),
        enabled: showModal,
    });
    const facturasDisponibles = facturas.filter(f => f.estado !== 'anulada' && f.estado !== 'pagada');
    const facturaSeleccionada = facturaId ? facturas.find(f => f.id === facturaId) : null;
    const saldo = facturaSeleccionada
        ? Number(facturaSeleccionada.total) - Number(facturaSeleccionada.monto_pagado ?? 0)
        : null;
    const createMut = useMutation({
        mutationFn: (body) => api.post('/api/pagos/', body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pagos'] });
            qc.invalidateQueries({ queryKey: ['facturas'] });
            setShowModal(false);
            resetModal();
            setToast({ msg: 'Pago registrado correctamente', ok: true });
            setTimeout(() => setToast(null), 3500);
        },
        onError: (err) => setError(err?.response?.data?.detail || 'Error al registrar pago'),
    });
    const deleteMut = useMutation({
        mutationFn: (pagoId) => api.delete(`/api/pagos/${pagoId}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pagos'] });
            qc.invalidateQueries({ queryKey: ['facturas'] });
            setToast({ msg: 'Abono eliminado', ok: true });
            setTimeout(() => setToast(null), 3000);
        },
        onError: (err) => {
            setToast({ msg: err?.response?.data?.detail || 'Error al eliminar', ok: false });
            setTimeout(() => setToast(null), 4000);
        },
    });
    function resetModal() {
        setFacturaId('');
        setFecha(new Date().toISOString().split('T')[0]);
        setMonto('');
        setMetodo('transferencia');
        setNota('');
        setError('');
    }
    const totalPagos = pagos.reduce((s, p) => s + Number(p.monto), 0);
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: "Pagos" }), pagos.length > 0 && (_jsxs("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-0.5", children: [pagos.length, " abono", pagos.length !== 1 ? 's' : '', " \u00B7 Total: ", fmtMoney(totalPagos)] }))] }), _jsxs("button", { onClick: () => { resetModal(); setShowModal(true); }, className: "flex items-center gap-2 px-3 py-2 text-sm bg-brand-500 hover:bg-brand-400 text-gray-900 rounded-lg font-medium transition-colors", children: [_jsx(Plus, { size: 15 }), "Registrar abono"] })] }), isLoading ? (_jsx("div", { className: "space-y-2", children: [1, 2, 3].map(i => (_jsx("div", { className: "h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" }, i))) })) : pagos.length === 0 ? (_jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center", children: [_jsx("p", { className: "text-gray-400 dark:text-gray-500 text-sm", children: "Sin pagos registrados a\u00FAn" }), _jsx("button", { onClick: () => { resetModal(); setShowModal(true); }, className: "mt-3 text-sm text-brand-400 hover:text-brand-300 transition-colors", children: "Registrar primer abono \u2192" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "md:hidden space-y-2", children: pagos.map(p => (_jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4", children: _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsxs("button", { onClick: () => navigate(`/facturas/${p.factura_id}`), className: "text-sm font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1", children: ["FAC-", String(p.factura?.numero ?? p.factura_id).padStart(5, '0'), _jsx(ExternalLink, { size: 11 })] }), _jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: p.fecha })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "font-semibold text-gray-900 dark:text-white", children: fmtMoney(p.monto) }), _jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400 capitalize bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full", children: p.metodo_pago })] }), p.nota && _jsx("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-1 truncate", children: p.nota }), p.registrado_por && (_jsxs("p", { className: "text-xs text-gray-400 dark:text-gray-500 mt-0.5", children: ["por ", p.registrado_por.name] }))] }), isAdmin && (_jsx("button", { onClick: () => { if (window.confirm('¿Eliminar este abono?'))
                                            deleteMut.mutate(p.id); }, className: "p-1.5 text-red-400 hover:text-red-500 rounded-lg transition-colors flex-shrink-0", children: _jsx(Trash2, { size: 15 }) }))] }) }, p.id))) }), _jsx("div", { className: "hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 font-medium text-left", children: "Factura" }), _jsx("th", { className: "px-4 py-3 font-medium text-left", children: "Fecha" }), _jsx("th", { className: "px-4 py-3 font-medium text-right", children: "Monto" }), _jsx("th", { className: "px-4 py-3 font-medium text-left", children: "M\u00E9todo" }), _jsx("th", { className: "px-4 py-3 font-medium text-left", children: "Nota" }), _jsx("th", { className: "px-4 py-3 font-medium text-left", children: "Registrado por" }), isAdmin && _jsx("th", { className: "px-4 py-3 w-12" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: pagos.map(p => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors", children: [_jsx("td", { className: "px-4 py-3", children: _jsxs("button", { onClick: () => navigate(`/facturas/${p.factura_id}`), className: "text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1", children: ["FAC-", String(p.factura?.numero ?? p.factura_id).padStart(5, '0'), _jsx(ExternalLink, { size: 11 })] }) }), _jsx("td", { className: "px-4 py-3 text-gray-700 dark:text-gray-300", children: p.fecha }), _jsx("td", { className: "px-4 py-3 text-right font-semibold text-gray-900 dark:text-white", children: fmtMoney(p.monto) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: "text-xs capitalize bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full", children: p.metodo_pago }) }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate", children: p.nota ?? '—' }), _jsx("td", { className: "px-4 py-3 text-gray-500 dark:text-gray-400 text-xs", children: p.registrado_por?.name ?? '—' }), isAdmin && (_jsx("td", { className: "px-4 py-3", children: _jsx("button", { onClick: () => { if (window.confirm('¿Eliminar este abono?'))
                                                        deleteMut.mutate(p.id); }, className: "p-1 text-red-400 hover:text-red-600 rounded transition-colors", children: _jsx(Trash2, { size: 14 }) }) }))] }, p.id))) })] }) })] })), showModal && (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-5 w-full max-w-sm", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-base font-semibold text-gray-900 dark:text-white", children: "Registrar abono" }), _jsx("button", { onClick: () => setShowModal(false), className: "p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded", children: _jsx(X, { size: 16 }) })] }), error && (_jsx("div", { className: "mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400", children: error })), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Factura" }), _jsxs("select", { value: facturaId, onChange: e => setFacturaId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500", children: [_jsx("option", { value: "", children: "Seleccionar factura..." }), facturasDisponibles.map(f => (_jsxs("option", { value: f.id, children: ["FAC-", String(f.numero).padStart(5, '0'), " \u00B7 ", f.cliente?.nombre, " \u00B7 ", fmtMoney(f.total)] }, f.id)))] }), saldo !== null && (_jsxs("p", { className: "mt-1 text-xs text-gray-500 dark:text-gray-400", children: ["Saldo pendiente: ", _jsx("span", { className: "font-medium text-amber-600 dark:text-amber-400", children: fmtMoney(saldo) })] }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha" }), _jsx("input", { type: "date", value: fecha, onChange: e => setFecha(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Monto" }), _jsx("input", { type: "number", min: "1", step: "1", value: monto, onChange: e => setMonto(e.target.value), placeholder: "0", className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "M\u00E9todo de pago" }), _jsx("select", { value: metodo, onChange: e => setMetodo(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500", children: METODOS_PAGO.map(m => _jsx("option", { value: m, children: m.charAt(0).toUpperCase() + m.slice(1) }, m)) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Nota (opcional)" }), _jsx("input", { type: "text", value: nota, onChange: e => setNota(e.target.value), placeholder: "Referencia, n\u00FAmero de transferencia...", className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500" })] })] }), _jsxs("div", { className: "flex gap-2 mt-5", children: [_jsx("button", { onClick: () => setShowModal(false), className: "flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" }), _jsxs("button", { disabled: !facturaId || !monto || createMut.isPending, onClick: () => createMut.mutate({ factura_id: Number(facturaId), fecha, monto: Number(monto), metodo_pago: metodo, nota: nota || null }), className: "flex-1 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-gray-900 rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5", children: [_jsx(Check, { size: 14 }), createMut.isPending ? 'Registrando...' : 'Registrar'] })] })] }) })), toast && (_jsx("div", { className: `fixed bottom-20 md:bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`, children: toast.msg }))] }));
}
