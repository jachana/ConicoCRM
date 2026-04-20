import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
function fmtMoney(n) {
    return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}
export default function CreditWarningModal({ mode, empresaNombre, credito, saleTotal, onConfirm, aprobacionPayload, onApproved, onDenied, onCancel, }) {
    const [requestState, setRequestState] = useState('form');
    const [aprobacionId, setAprobacionId] = useState(null);
    const [nota, setNota] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    useEffect(() => {
        if (requestState !== 'waiting' || !aprobacionId)
            return;
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/api/aprobaciones/${aprobacionId}`);
                const { estado, nv_id } = res.data;
                if (estado === 'aprobada' && nv_id) {
                    clearInterval(interval);
                    onApproved?.(nv_id);
                }
                else if (estado === 'denegada') {
                    clearInterval(interval);
                    onDenied?.();
                }
            }
            catch {
                // ignore poll errors, keep waiting
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [requestState, aprobacionId, onApproved, onDenied]);
    async function handleSolicitar() {
        if (!aprobacionPayload)
            return;
        setSubmitting(true);
        setSubmitError('');
        try {
            const res = await api.post('/api/aprobaciones/', {
                ...aprobacionPayload,
                nota: nota || null,
            });
            setAprobacionId(res.data.id);
            setRequestState('waiting');
        }
        catch (err) {
            setSubmitError(err?.response?.data?.detail || 'Error al enviar solicitud');
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { className: "bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-md mx-4", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-xl font-bold", children: "!" }), _jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-gray-900 dark:text-white", children: "L\u00EDmite de cr\u00E9dito excedido" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400", children: empresaNombre })] })] }), _jsxs("div", { className: "space-y-2 mb-5 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "L\u00EDmite de cr\u00E9dito" }), _jsx("span", { className: "font-medium text-gray-900 dark:text-white", children: fmtMoney(credito.limite_credito) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "Cr\u00E9dito usado" }), _jsx("span", { className: "font-medium text-red-600 dark:text-red-400", children: fmtMoney(credito.credito_usado) })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "Disponible" }), _jsx("span", { className: "font-medium text-gray-900 dark:text-white", children: fmtMoney(credito.credito_disponible) })] }), _jsxs("div", { className: "flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2", children: [_jsx("span", { className: "text-gray-600 dark:text-gray-400", children: "Esta venta" }), _jsx("span", { className: "font-semibold text-gray-900 dark:text-white", children: fmtMoney(saleTotal) })] })] }), mode === 'warning' && (_jsxs("div", { className: "flex gap-2 justify-end", children: [_jsx("button", { onClick: onCancel, className: "px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" }), _jsx("button", { onClick: onConfirm, className: "px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium", children: "Guardar de todas formas" })] })), mode === 'request' && requestState === 'form' && (_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600 dark:text-gray-400 mb-3", children: "Se enviar\u00E1 una solicitud de aprobaci\u00F3n al administrador." }), _jsx("textarea", { placeholder: "Nota opcional para el administrador...", value: nota, onChange: e => setNota(e.target.value), rows: 2, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3" }), submitError && (_jsx("p", { className: "text-xs text-red-600 dark:text-red-400 mb-2", children: submitError })), _jsxs("div", { className: "flex gap-2 justify-end", children: [_jsx("button", { onClick: onCancel, className: "px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" }), _jsx("button", { onClick: handleSolicitar, disabled: submitting, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium", children: submitting ? 'Enviando...' : 'Solicitar Aprobación' })] })] })), mode === 'request' && requestState === 'waiting' && (_jsxs("div", { className: "text-center py-2", children: [_jsxs("div", { className: "flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4", children: [_jsxs("svg", { className: "animate-spin h-4 w-4 text-blue-500", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] }), "Esperando aprobaci\u00F3n del administrador..."] }), _jsx("button", { onClick: onCancel, className: "px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cancelar" })] }))] }) }));
}
