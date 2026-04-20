import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { openPdf } from '../lib/pdf';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileText, Mail, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
const ESTADOS = [
    { value: 'no_definido', label: 'Sin definir' },
    { value: 'abierta', label: 'Abierta' },
    { value: 'cerrada_fv', label: 'Cerrada (FV)' },
    { value: 'rechazada', label: 'Rechazada' },
];
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
export default function CotizacionDetalle() {
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
    const [estado, setEstado] = useState('no_definido');
    const [nota, setNota] = useState('');
    const [lineas, setLineas] = useState([newLinea(1)]);
    const [empresaId, setEmpresaId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [emailToast, setEmailToast] = useState(null);
    const [autocompleteIdx, setAutocompleteIdx] = useState(null);
    const [autocompleteResults, setAutocompleteResults] = useState([]);
    const { data: cotizacion } = useQuery({
        queryKey: ['cotizacion', id],
        queryFn: () => api.get(`/api/cotizaciones/${id}`).then(r => r.data),
        enabled: !isNew,
    });
    useEffect(() => {
        if (cotizacion) {
            setClienteId(cotizacion.cliente_id);
            setVendedorId(cotizacion.vendedor_id);
            setContacto(cotizacion.contacto ?? '');
            setCorreo(cotizacion.correo ?? '');
            setFecha(cotizacion.fecha);
            setEstado(cotizacion.estado);
            setNota(cotizacion.nota ?? '');
            setEmpresaId(cotizacion.empresa_id ?? '');
            setLineas((cotizacion.lineas ?? []).map((l, i) => calcLinea({
                ...l,
                _key: `${l.id ?? i}`,
                producto_id: l.producto_id ?? null,
                sku: l.sku ?? null,
                formato: l.formato ?? null,
                margen: l.margen ?? null,
            })));
        }
    }, [cotizacion]);
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
                vendedor_id: vendedorId || currentUser?.id,
                contacto: contacto || null,
                correo: correo || null,
                fecha,
                estado,
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
            let cotId;
            if (isNew) {
                const res = await api.post('/api/cotizaciones/', { ...payload, lineas: lineasPayload });
                cotId = res.data.id;
            }
            else {
                await api.patch(`/api/cotizaciones/${id}`, payload);
                await api.put(`/api/cotizaciones/${id}/lineas`, lineasPayload);
                cotId = Number(id);
            }
            qc.invalidateQueries({ queryKey: ['cotizaciones'] });
            navigate(`/cotizaciones/${cotId}`);
        }
        catch (err) {
            setError(err?.response?.data?.detail || 'Error al guardar');
        }
        finally {
            setSaving(false);
        }
    }
    const emailMut = useMutation({
        mutationFn: () => api.post(`/api/cotizaciones/${id}/email`),
        onSuccess: () => {
            setEmailToast({ msg: 'Email enviado correctamente', ok: true });
            setTimeout(() => setEmailToast(null), 3500);
        },
        onError: (err) => {
            setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false });
            setTimeout(() => setEmailToast(null), 4000);
        },
    });
    const crearNvMut = useMutation({
        mutationFn: () => api.post(`/api/nota_ventas/from_cotizacion/${id}`),
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ['cotizacion', id] });
            navigate(`/notas-venta/${res.data.id}`);
        },
        onError: (err) => {
            setError(err?.response?.data?.detail || 'Error al crear nota de venta');
        },
    });
    return (_jsxs("div", { className: "p-4 md:p-6 max-w-6xl", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/cotizaciones'), className: "p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx("h1", { className: "text-xl font-semibold text-gray-900 dark:text-white", children: isNew ? 'Nueva cotización' : `COT-${String(cotizacion?.numero ?? '').padStart(5, '0')}` })] }), _jsxs("div", { className: "flex items-center gap-2", children: [!isNew && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => openPdf(`/api/cotizaciones/${id}/pdf`), className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors", children: [_jsx(FileText, { size: 15 }), "PDF"] }), _jsxs("button", { onClick: () => emailMut.mutate(), disabled: emailMut.isPending, className: "flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50", children: [_jsx(Mail, { size: 15 }), emailMut.isPending ? 'Enviando...' : 'Email'] }), _jsx("button", { onClick: () => crearNvMut.mutate(), disabled: crearNvMut.isPending, className: "flex items-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors", children: crearNvMut.isPending ? 'Creando...' : 'Crear NV' })] })), _jsx("button", { onClick: handleSave, disabled: saving, className: "px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium", children: saving ? 'Guardando...' : 'Guardar' })] })] }), error && _jsx("div", { className: "mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400", children: error }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5", children: _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Cliente *" }), _jsxs("select", { value: clienteId, onChange: e => handleClienteChange(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", children: [_jsx("option", { value: "", children: "Seleccionar cliente..." }), clientes.map(c => (_jsxs("option", { value: c.id, children: [c.nombre, c.rut ? ` · ${c.rut}` : ''] }, c.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Empresa" }), _jsxs("select", { value: empresaId, onChange: e => setEmpresaId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none", children: [_jsx("option", { value: "", children: "\u2014 Sin empresa \u2014" }), empresas.map(e => _jsx("option", { value: e.id, children: e.nombre }, e.id))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Contacto" }), _jsx("input", { type: "text", value: contacto, onChange: e => setContacto(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "Nombre del contacto" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Correo" }), _jsx("input", { type: "email", value: correo, onChange: e => setCorreo(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "email@ejemplo.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Fecha" }), _jsx("input", { type: "date", value: fecha, onChange: e => setFecha(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Estado" }), _jsx("select", { value: estado, onChange: e => setEstado(e.target.value), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", children: ESTADOS.map(e => _jsx("option", { value: e.value, children: e.label }, e.value)) })] }), isAdmin && (_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Encargado" }), _jsx("select", { value: vendedorId, onChange: e => setVendedorId(e.target.value ? Number(e.target.value) : ''), className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500", children: usuarios.map(u => _jsx("option", { value: u.id, children: u.name }, u.id)) })] })), _jsxs("div", { className: "sm:col-span-2 lg:col-span-3", children: [_jsx("label", { className: "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1", children: "Nota / Observaciones" }), _jsx("textarea", { value: nota, onChange: e => setNota(e.target.value), rows: 2, className: "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none", placeholder: "Notas internas o para el cliente..." })] })] }) }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4", children: _jsxs("table", { className: "w-full text-sm min-w-[900px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-3 font-medium text-center w-10", children: "N\u00BA" }), _jsx("th", { className: "px-3 py-3 font-medium w-24", children: "SKU" }), _jsx("th", { className: "px-3 py-3 font-medium", children: "Descripci\u00F3n" }), _jsx("th", { className: "px-3 py-3 font-medium w-28", children: "Formato" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-20", children: "Cant." }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Valor Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total Neto" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-24", children: "IVA" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-28", children: "Total" }), _jsx("th", { className: "px-3 py-3 font-medium text-right w-20", children: "Margen" }), _jsx("th", { className: "px-3 py-3 w-10" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-800", children: lineas.map((linea, idx) => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-2 text-center text-gray-500 dark:text-gray-400", children: idx + 1 }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: linea.sku ?? '', onChange: e => updateLinea(idx, { sku: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "SKU" }) }), _jsxs("td", { className: "px-3 py-2 relative", children: [_jsx("input", { type: "text", value: linea.descripcion, onChange: e => handleDescripcionChange(idx, e.target.value), onBlur: () => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]); }, 200), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "Descripci\u00F3n del producto..." }), autocompleteIdx === idx && autocompleteResults.length > 0 && (_jsx("div", { className: "absolute z-20 left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden", children: autocompleteResults.slice(0, 8).map(p => (_jsxs("button", { type: "button", onMouseDown: () => selectProducto(idx, p), className: "w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0", children: [_jsx("div", { className: "font-medium text-gray-900 dark:text-white", children: p.nombre }), _jsxs("div", { className: "text-gray-500", children: [p.sku ? `SKU: ${p.sku}` : '', p.formato ? ` · ${p.formato}` : '', " \u00B7 $ ", p.precio_venta.toLocaleString('es-CL')] })] }, p.id))) }))] }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: linea.formato ?? '', onChange: e => updateLinea(idx, { formato: e.target.value || null }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500", placeholder: "Formato" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "1", value: linea.cantidad, onChange: e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "0", value: linea.valor_neto, onChange: e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 }), className: "w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" }) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium", children: fmtMoney(linea.total_neto) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs", children: fmtMoney(linea.iva) }), _jsx("td", { className: "px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium", children: fmtMoney(linea.total) }), _jsx("td", { className: "px-3 py-2 text-right text-xs", children: linea.margen !== null
                                            ? _jsxs("span", { className: linea.margen >= 0.15 ? 'text-green-600 dark:text-green-400' : 'text-orange-500', children: [(linea.margen * 100).toFixed(1), "%"] })
                                            : _jsx("span", { className: "text-gray-400", children: "\u2014" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("button", { onClick: () => removeLinea(idx), className: "p-1 text-gray-400 hover:text-red-500 transition-colors", disabled: lineas.length === 1, children: _jsx(Trash2, { size: 14 }) }) })] }, linea._key))) })] }) }), _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("button", { onClick: addLinea, className: "flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors", children: [_jsx(Plus, { size: 15 }), "Agregar l\u00EDnea"] }), _jsx("div", { className: "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 min-w-[260px]", children: _jsxs("div", { className: "space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "Total Neto" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalNeto) })] }), _jsxs("div", { className: "flex justify-between text-gray-600 dark:text-gray-400", children: [_jsx("span", { children: "IVA (19%)" }), _jsx("span", { className: "font-medium", children: fmtMoney(totalIva) })] }), _jsxs("div", { className: "flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 font-bold text-gray-900 dark:text-white text-base", children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmtMoney(total) })] })] }) })] }), emailToast && (_jsx("div", { className: `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`, children: emailToast.msg }))] }));
}
