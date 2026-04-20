import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { openPdf } from '../lib/pdf';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileText, Mail, ArrowLeft, ExternalLink, Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CreditWarningModal from '../components/CreditWarningModal';
const ESTADO_LABELS = {
    pendiente: 'Pendiente',
    despachada: 'Despachada',
    entregada: 'Entregada',
    pagada: 'Pagada',
    cancelada: 'Cancelada',
};
const ESTADO_COLORS = {
    pendiente: 'bg-gray-100 text-gray-700',
    despachada: 'bg-blue-100 text-blue-700',
    entregada: 'bg-yellow-100 text-yellow-700',
    pagada: 'bg-green-100 text-green-700',
    cancelada: 'bg-red-100 text-red-700',
};
function getValidTransitions(estado, isAdmin) {
    const adminOnly = ['pagada', 'cancelada'];
    const all = {
        pendiente: ['despachada', 'cancelada'],
        despachada: ['entregada', 'cancelada'],
        entregada: ['pagada', 'cancelada'],
    };
    const targets = all[estado] ?? [];
    return isAdmin ? targets : targets.filter(t => !adminOnly.includes(t));
}
function newLinea(orden) {
    return {
        _key: `${Date.now()}-${orden}`,
        orden,
        producto_id: null,
        sku: null,
        descripcion: '',
        formato: null,
        cantidad: 1,
        valor_neto: 0,
        total_neto: 0,
        iva: 0,
        total: 0,
        margen: null,
    };
}
function calcLinea(l) {
    const cantidad = Number(l.cantidad) || 0;
    const valor_neto = Number(l.valor_neto) || 0;
    const total_neto = cantidad * valor_neto;
    const iva = Math.round(total_neto * 0.19 * 100) / 100;
    const total = total_neto + iva;
    return { ...l, cantidad, valor_neto, total_neto, iva, total };
}
function fmtMoney(n) {
    return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}
export default function NotaVentaDetalle() {
    const { id } = useParams();
    const isNew = !id || id === 'nueva';
    const navigate = useNavigate();
    const qc = useQueryClient();
    const currentUser = useAuthStore(s => s.user);
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin';
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState(currentUser?.id ?? '');
    const [contacto, setContacto] = useState('');
    const [correo, setCorreo] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [nota, setNota] = useState('');
    const [lineas, setLineas] = useState([newLinea(1)]);
    const [empresaId, setEmpresaId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [emailToast, setEmailToast] = useState(null);
    const [showEstadoMenu, setShowEstadoMenu] = useState(false);
    const [creditModal, setCreditModal] = useState(null);
    const [autocompleteIdx, setAutocompleteIdx] = useState(null);
    const [autocompleteResults, setAutocompleteResults] = useState([]);
    const { data: nv } = useQuery({
        queryKey: ['nota_venta', id],
        queryFn: () => api.get(`/api/nota_ventas/${id}`).then(r => r.data),
        enabled: !isNew,
    });
    useEffect(() => {
        if (nv) {
            setClienteId(nv.cliente_id);
            setVendedorId(nv.vendedor_id ?? '');
            setContacto(nv.contacto ?? '');
            setCorreo(nv.correo ?? '');
            setFecha(nv.fecha);
            setNota(nv.nota ?? '');
            setEmpresaId(nv.empresa_id ?? '');
            setLineas((nv.lineas ?? []).map((l, i) => ({
                ...l,
                _key: `${l.id ?? i}`,
                producto_id: l.producto_id ?? null,
                sku: l.sku ?? null,
                formato: l.formato ?? null,
                margen: l.margen ?? null,
            })));
        }
    }, [nv]);
    const { data: clientes = [] } = useQuery({
        queryKey: ['clientes'],
        queryFn: () => api.get('/api/clientes/').then(r => r.data),
    });
    const { data: usuarios = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => api.get('/api/users').then(r => r.data),
        enabled: isAdmin,
    });
    const { data: empresas = [] } = useQuery({
        queryKey: ['empresas'],
        queryFn: () => api.get('/api/empresas/').then(r => r.data),
    });
    function handleClienteChange(cid) {
        setClienteId(cid);
        if (cid) {
            const c = clientes.find(cl => cl.id === cid);
            if (c) {
                if (!contacto)
                    setContacto(c.nombre);
                if (!correo && c.email)
                    setCorreo(c.email);
                if (c.empresa_id && !empresaId)
                    setEmpresaId(c.empresa_id);
            }
        }
    }
    const fetchAutocomplete = useCallback(async (q) => {
        if (q.length < 2) {
            setAutocompleteResults([]);
            return;
        }
        try {
            const res = await api.get(`/api/productos/buscar?q=${encodeURIComponent(q)}`);
            setAutocompleteResults(res.data);
        }
        catch {
            setAutocompleteResults([]);
        }
    }, []);
    function handleDescripcionChange(idx, value) {
        setAutocompleteIdx(idx);
        fetchAutocomplete(value);
        updateLinea(idx, { descripcion: value });
    }
    function selectProducto(idx, producto) {
        setLineas(prev => prev.map((l, i) => {
            if (i !== idx)
                return l;
            const updated = {
                ...l,
                producto_id: producto.id,
                sku: producto.sku ?? null,
                descripcion: producto.nombre,
                formato: producto.formato ?? null,
                valor_neto: producto.precio_venta,
                margen: producto.precio_venta > 0
                    ? (producto.precio_venta - producto.precio_costo) / producto.precio_venta
                    : null,
            };
            return calcLinea(updated);
        }));
        setAutocompleteIdx(null);
        setAutocompleteResults([]);
    }
    function updateLinea(idx, patch) {
        setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })));
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
    async function checkCredit(saleTotal, onProceed, aprobacionPayload) {
        if (!empresaId) {
            onProceed();
            return;
        }
        const empresa = empresas.find(e => e.id === empresaId);
        if (!empresa?.limite_credito) {
            onProceed();
            return;
        }
        try {
            const res = await api.get(`/api/empresas/${empresaId}/credito`);
            const credito = res.data;
            if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
                setCreditModal({
                    credito,
                    aprobacionPayload,
                    onApproved: (nvId) => { setCreditModal(null); navigate(`/notas-venta/${nvId}`); },
                    onDenied: () => { setCreditModal(null); setError('Solicitud denegada por el administrador.'); },
                });
            }
            else {
                onProceed();
            }
        }
        catch {
            onProceed();
        }
    }
    async function handleSave() {
        if (!clienteId) {
            setError('Selecciona un cliente');
            return;
        }
        if (!isNew) {
            doSave();
            return;
        }
        const lineasPayload = lineas.map((l, i) => ({
            orden: i + 1,
            producto_id: l.producto_id,
            sku: l.sku,
            descripcion: l.descripcion,
            formato: l.formato,
            cantidad: l.cantidad,
            valor_neto: l.valor_neto,
        }));
        const aprobacionPayload = {
            empresa_id: Number(empresaId) || 0,
            total,
            origen: 'directa',
            nv_payload: {
                cliente_id: clienteId,
                vendedor_id: vendedorId || currentUser?.id,
                contacto: contacto || null,
                correo: correo || null,
                fecha,
                nota: nota || null,
                empresa_id: empresaId || null,
                lineas: lineasPayload,
            },
        };
        checkCredit(total, doSave, aprobacionPayload);
    }
    async function doSave() {
        setSaving(true);
        setError('');
        try {
            const payload = {
                cliente_id: clienteId,
                vendedor_id: vendedorId || currentUser?.id,
                contacto: contacto || null,
                correo: correo || null,
                fecha,
                nota: nota || null,
                empresa_id: empresaId || null,
            };
            const lineasPayload = lineas.map((l, i) => ({
                orden: i + 1,
                producto_id: l.producto_id,
                sku: l.sku,
                descripcion: l.descripcion,
                formato: l.formato,
                cantidad: l.cantidad,
                valor_neto: l.valor_neto,
            }));
            let nvId;
            if (isNew) {
                const res = await api.post('/api/nota_ventas/', { ...payload, lineas: lineasPayload });
                nvId = res.data.id;
            }
            else {
                await api.patch(`/api/nota_ventas/${id}`, payload);
                await api.put(`/api/nota_ventas/${id}/lineas`, lineasPayload);
                nvId = Number(id);
            }
            qc.invalidateQueries({ queryKey: ['nota_ventas'] });
            navigate(`/notas-venta/${nvId}`);
        }
        catch (err) {
            setError(err?.response?.data?.detail || 'Error al guardar');
        }
        finally {
            setSaving(false);
        }
    }
    const estadoMut = useMutation({
        mutationFn: (nuevoEstado) => api.patch(`/api/nota_ventas/${id}/estado`, { estado: nuevoEstado }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['nota_venta', id] });
            setShowEstadoMenu(false);
        },
        onError: (err) => {
            setError(err?.response?.data?.detail || 'Error al cambiar estado');
            setShowEstadoMenu(false);
        },
    });
    const emailMut = useMutation({
        mutationFn: () => api.post(`/api/nota_ventas/${id}/email`),
        onSuccess: () => {
            setEmailToast({ msg: 'Email enviado correctamente', ok: true });
            setTimeout(() => setEmailToast(null), 3500);
        },
        onError: (err) => {
            setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false });
            setTimeout(() => setEmailToast(null), 4000);
        },
    });
    const genFacturaMut = useMutation({
        mutationFn: () => api.post(`/api/facturas/from_nv/${id}`),
        onSuccess: (res) => navigate(`/facturas/${res.data.id}`),
    });
    const validTransitions = !isNew && nv ? getValidTransitions(nv.estado, isAdmin) : [];
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/notas-venta'), className: "p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: isNew ? 'Nueva nota de venta' : `NV-${String(nv?.numero ?? '').padStart(5, '0')}` }), !isNew && nv && (_jsx("span", { className: `px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`, children: ESTADO_LABELS[nv.estado] ?? nv.estado }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [!isNew && nv && validTransitions.length > 0 && (_jsxs("div", { className: "relative", children: [_jsx("button", { onClick: () => setShowEstadoMenu(v => !v), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: "Cambiar estado" }), showEstadoMenu && (_jsx("div", { className: "absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]", children: validTransitions.map(t => (_jsxs("button", { onClick: () => estadoMut.mutate(t), className: "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg text-gray-700 dark:text-gray-300", children: ["\u2192 ", ESTADO_LABELS[t]] }, t))) }))] })), !isNew && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => openPdf(`/api/nota_ventas/${id}/pdf`), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: [_jsx(FileText, { size: 15 }), "PDF"] }), _jsxs("button", { onClick: () => emailMut.mutate(), disabled: emailMut.isPending, className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50", children: [_jsx(Mail, { size: 15 }), emailMut.isPending ? 'Enviando...' : 'Email'] }), nv?.factura_id == null && (_jsxs("button", { onClick: () => genFacturaMut.mutate(), disabled: genFacturaMut.isPending, className: "flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50", children: [_jsx(Receipt, { size: 15 }), " Generar Factura"] })), nv?.factura_id != null && (_jsxs(Link, { to: `/facturas/${nv.factura_id}`, className: "flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200", children: [_jsx(Receipt, { size: 15 }), " Ver Factura"] }))] })), _jsx("button", { onClick: handleSave, disabled: saving, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium", children: saving ? 'Guardando...' : 'Guardar' })] })] }), !isNew && nv?.cotizacion_id && (_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: "Originada desde cotizaci\u00F3n:" }), _jsxs("button", { onClick: () => navigate(`/cotizaciones/${nv.cotizacion_id}`), className: "flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline", children: ["COT-", String(nv.cotizacion?.numero ?? nv.cotizacion_id).padStart(5, '0'), _jsx(ExternalLink, { size: 11 })] })] })), error && (_jsx("div", { className: "mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400", children: error })), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5", children: _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Cliente *" }), _jsxs("select", { value: clienteId, onChange: e => handleClienteChange(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", children: [_jsx("option", { value: "", children: "Seleccionar cliente..." }), clientes.map(c => (_jsxs("option", { value: c.id, children: [c.nombre, c.rut ? ` · ${c.rut}` : ''] }, c.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Empresa" }), _jsxs("select", { value: empresaId, onChange: e => setEmpresaId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none", children: [_jsx("option", { value: "", children: "\u2014 Sin empresa \u2014" }), empresas.map(e => _jsx("option", { value: e.id, children: e.nombre }, e.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Contacto" }), _jsx("input", { type: "text", value: contacto, onChange: e => setContacto(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "Nombre del contacto" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Correo" }), _jsx("input", { type: "email", value: correo, onChange: e => setCorreo(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "email@ejemplo.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha" }), _jsx("input", { type: "date", value: fecha, onChange: e => setFecha(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" })] }), isAdmin && (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Encargado" }), _jsx("select", { value: vendedorId, onChange: e => setVendedorId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", children: usuarios.map(u => _jsx("option", { value: u.id, children: u.name }, u.id)) })] })), _jsxs("div", { className: "sm:col-span-2 lg:col-span-3", children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Nota / Observaciones" }), _jsx("textarea", { value: nota, onChange: e => setNota(e.target.value), rows: 2, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none", placeholder: "Notas internas o para el cliente..." })] })] }) }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4", children: _jsxs("table", { className: "w-full text-sm min-w-[900px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-3 font-medium text-center w-10", children: "N\u00BA" }), _jsx("th", { className: "px-3 py-3 font-medium w-24", children: "SKU" }), _jsx("th", { className: "px-3 py-3 font-medium", children: "Descripci\u00F3n" }), _jsx("th", { className: "px-3 py-3 font-medium w-28", children: "Formato" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-20", children: "Cant." }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Valor Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-24", children: "IVA" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-20", children: "Margen" }), _jsx("th", { className: "px-3 py-3 w-10" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: lineas.map((linea, idx) => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-2 text-center text-gray-500 dark:text-gray-400", children: idx + 1 }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: linea.sku ?? '', onChange: e => updateLinea(idx, { sku: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "SKU" }) }), _jsxs("td", { className: "px-3 py-2 relative", children: [_jsx("input", { type: "text", value: linea.descripcion, onChange: e => handleDescripcionChange(idx, e.target.value), onBlur: () => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]); }, 200), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "Descripci\u00F3n..." }), autocompleteIdx === idx && autocompleteResults.length > 0 && (_jsx("div", { className: "absolute z-20 left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden", children: autocompleteResults.slice(0, 8).map(p => (_jsxs("button", { type: "button", onMouseDown: () => selectProducto(idx, p), className: "w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0", children: [_jsx("div", { className: "font-medium text-gray-900 dark:text-white", children: p.nombre }), _jsxs("div", { className: "text-gray-500", children: [p.sku ? `SKU: ${p.sku}` : '', p.formato ? ` · ${p.formato}` : '', " \u00B7 $ ", p.precio_venta.toLocaleString('es-CL')] })] }, p.id))) }))] }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: linea.formato ?? '', onChange: e => updateLinea(idx, { formato: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "Formato" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "1", value: linea.cantidad, onChange: e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "0", value: linea.valor_neto, onChange: e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" }) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium", children: fmtMoney(linea.total_neto) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs", children: fmtMoney(linea.iva) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium", children: fmtMoney(linea.total) }), _jsx("td", { className: "px-3 py-2 text-right text-xs", children: linea.margen !== null
                                            ? _jsxs("span", { className: linea.margen >= 0.15 ? 'text-green-600 dark:text-green-400' : 'text-orange-500', children: [(linea.margen * 100).toFixed(1), "%"] })
                                            : _jsx("span", { className: "text-gray-400", children: "\u2014" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("button", { onClick: () => removeLinea(idx), className: "p-1 text-gray-400 hover:text-red-500 transition-colors", disabled: lineas.length === 1, children: _jsx(Trash2, { size: 14 }) }) })] }, linea._key))) })] }) }), _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("button", { onClick: addLinea, className: "flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors", children: [_jsx(Plus, { size: 15 }), "Agregar l\u00EDnea"] }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 min-w-[260px]", children: _jsxs("div", { className: "space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "Total Neto" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalNeto) })] }), _jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "IVA (19%)" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalIva) })] }), _jsxs("div", { className: "flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 font-bold text-gray-900 dark:text-white text-base", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmtMoney(total) })] })] }) })] }), emailToast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`, children: emailToast.msg })), creditModal && (_jsx(CreditWarningModal, { mode: "request", empresaNombre: empresas.find(e => e.id === empresaId)?.nombre ?? '', credito: creditModal.credito, saleTotal: total, aprobacionPayload: creditModal.aprobacionPayload, onApproved: creditModal.onApproved, onDenied: creditModal.onDenied, onCancel: () => setCreditModal(null) }))] }));
}
