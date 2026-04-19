import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Mail, ArrowLeft, ExternalLink, Pencil, X, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Factura, FacturaLinea, Cliente, User, Empresa } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  emitida: 'Emitida',
  pagada:  'Pagada',
  anulada: 'Anulada',
}

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700',
  pagada:  'bg-green-100 text-green-700',
  anulada: 'bg-red-100 text-red-700',
}

function getValidTransitions(estado: string): string[] {
  const all: Record<string, string[]> = {
    emitida: ['pagada', 'anulada'],
    pagada:  ['anulada'],
    anulada: [],
  }
  return all[estado] ?? []
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

type LineaLocal = FacturaLinea & { _key: string }

function calcLinea(l: LineaLocal): LineaLocal {
  const total_neto = l.cantidad * l.valor_neto
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  const total = total_neto + iva
  return { ...l, total_neto, iva, total }
}

interface PaymentModalProps {
  onConfirm: (data: { fecha_pago: string; monto_pagado: number; metodo_pago: string }) => void
  onCancel: () => void
  totalSugerido: number
}

function PaymentModal({ onConfirm, onCancel, totalSugerido }: PaymentModalProps) {
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [montoPagado, setMontoPagado] = useState(totalSugerido)
  const [metodoPago, setMetodoPago] = useState('transferencia')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Registrar pago</h2>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={fechaPago}
              onChange={e => setFechaPago(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Monto pagado</label>
            <input
              type="number"
              min="0"
              step="1"
              value={montoPagado}
              onChange={e => setMontoPagado(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Método de pago</label>
            <select
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="deposito">Depósito</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ fecha_pago: fechaPago, monto_pagado: montoPagado, metodo_pago: metodoPago })}
            className="flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5"
          >
            <Check size={14} />
            Confirmar pago
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FacturaDetalle() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'

  // Header edit state
  const [editing, setEditing] = useState(false)
  const [editingLineas, setEditingLineas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Form fields
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>('')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [nota, setNota] = useState('')
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [lineas, setLineas] = useState<LineaLocal[]>([])

  const { data: factura } = useQuery<Factura>({
    queryKey: ['factura', id],
    queryFn: () => api.get(`/api/facturas/${id}`).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (factura) {
      setClienteId(factura.cliente_id)
      setVendedorId(factura.vendedor_id ?? '')
      setContacto(factura.contacto ?? '')
      setCorreo(factura.correo ?? '')
      setFecha(factura.fecha)
      setFechaVencimiento(factura.fecha_vencimiento ?? '')
      setNota(factura.nota ?? '')
      setEmpresaId(factura.empresa_id ?? '')
      setLineas(
        (factura.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
        }))
      )
    }
  }, [factura])

  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
    enabled: editing,
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    enabled: editing && isAdmin,
  })

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
    enabled: editing,
  })

  function updateLinea(idx: number, patch: Partial<LineaLocal>) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })))
  }

  const totalNeto = lineas.reduce((s, l) => s + l.total_neto, 0)
  const totalIva = lineas.reduce((s, l) => s + l.iva, 0)
  const total = lineas.reduce((s, l) => s + l.total, 0)

  async function handleSave() {
    if (!clienteId) { setError('Selecciona un cliente'); return }
    setSaving(true)
    setError('')
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
      }
      await api.patch(`/api/facturas/${id}`, payload)
      if (editingLineas) {
        const lineasPayload = lineas.map((l, i) => ({
          orden: i + 1,
          producto_id: l.producto_id,
          sku: l.sku,
          descripcion: l.descripcion,
          formato: l.formato,
          cantidad: l.cantidad,
          valor_neto: l.valor_neto,
        }))
        await api.put(`/api/facturas/${id}/lineas`, lineasPayload)
      }
      qc.invalidateQueries({ queryKey: ['factura', id] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setEditing(false)
      setEditingLineas(false)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    // Reset to server data
    if (factura) {
      setClienteId(factura.cliente_id)
      setVendedorId(factura.vendedor_id ?? '')
      setContacto(factura.contacto ?? '')
      setCorreo(factura.correo ?? '')
      setFecha(factura.fecha)
      setFechaVencimiento(factura.fecha_vencimiento ?? '')
      setNota(factura.nota ?? '')
      setEmpresaId(factura.empresa_id ?? '')
      setLineas(
        (factura.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
        }))
      )
    }
    setEditing(false)
    setEditingLineas(false)
    setError('')
  }

  const estadoMut = useMutation({
    mutationFn: (payload: { estado: string; fecha_pago?: string; monto_pagado?: number; metodo_pago?: string }) =>
      api.patch(`/api/facturas/${id}/estado`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['factura', id] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setShowEstadoMenu(false)
      setShowPaymentModal(false)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al cambiar estado')
      setShowEstadoMenu(false)
      setShowPaymentModal(false)
    },
  })

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/facturas/${id}/email`),
    onSuccess: () => {
      setEmailToast({ msg: 'Email enviado correctamente', ok: true })
      setTimeout(() => setEmailToast(null), 3500)
    },
    onError: (err: any) => {
      setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false })
      setTimeout(() => setEmailToast(null), 4000)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/facturas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas'] })
      navigate('/facturas')
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al eliminar factura')
    },
  })

  function handleEstadoClick(nuevoEstado: string) {
    if (nuevoEstado === 'pagada') {
      setShowEstadoMenu(false)
      setShowPaymentModal(true)
    } else {
      estadoMut.mutate({ estado: nuevoEstado })
    }
  }

  function handlePaymentConfirm(data: { fecha_pago: string; monto_pagado: number; metodo_pago: string }) {
    estadoMut.mutate({ estado: 'pagada', ...data })
  }

  const validTransitions = factura ? getValidTransitions(factura.estado) : []
  const canDelete = factura?.estado === 'emitida'

  if (!factura) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/facturas')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/facturas')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            FAC-{String(factura.numero).padStart(5, '0')}
          </h1>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[factura.estado] ?? 'bg-gray-100 text-gray-700'}`}>
            {ESTADO_LABELS[factura.estado] ?? factura.estado}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {validTransitions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowEstadoMenu(v => !v)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cambiar estado
              </button>
              {showEstadoMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                  {validTransitions.map(t => (
                    <button key={t} onClick={() => handleEstadoClick(t)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg text-gray-700 dark:text-gray-300">
                      → {ESTADO_LABELS[t] ?? t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => window.open(`/api/facturas/${id}/pdf`, '_blank')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <FileText size={15} />
            PDF
          </button>
          <button
            onClick={() => emailMut.mutate()}
            disabled={emailMut.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Mail size={15} />
            {emailMut.isPending ? 'Enviando...' : 'Email'}
          </button>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <Pencil size={14} />
              Editar
            </button>
          ) : (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (window.confirm('¿Eliminar esta factura?')) deleteMut.mutate()
              }}
              className="px-3 py-2 text-sm border border-red-300 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Origin references */}
      {(factura.nv_id || factura.cotizacion_id) && (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {factura.nv_id && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Nota de venta:</span>
              <button
                onClick={() => navigate(`/notas-venta/${factura.nv_id}`)}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                NV-{String(factura.nv?.numero ?? factura.nv_id).padStart(5, '0')}
                <ExternalLink size={11} />
              </button>
            </div>
          )}
          {factura.cotizacion_id && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Cotización:</span>
              <button
                onClick={() => navigate(`/cotizaciones/${factura.cotizacion_id}`)}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                COT-{String(factura.cotizacion?.numero ?? factura.cotizacion_id).padStart(5, '0')}
                <ExternalLink size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Header card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
              <select
                value={clienteId}
                onChange={e => setClienteId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` · ${c.rut}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Empresa</label>
              <select
                value={empresaId}
                onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Sin empresa —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contacto</label>
              <input
                type="text"
                value={contacto}
                onChange={e => setContacto(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Nombre del contacto"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Correo</label>
              <input
                type="email"
                value={correo}
                onChange={e => setCorreo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha emisión</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha vencimiento</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={e => setFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vendedor</label>
                <select
                  value={vendedorId}
                  onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Sin asignar —</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nota / Observaciones</label>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Notas internas o para el cliente..."
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
            <div>
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Cliente</span>
              <span className="text-sm text-gray-900 dark:text-white font-medium">
                {factura.cliente?.nombre ?? '—'}
                {factura.cliente?.rut ? <span className="text-gray-500 font-normal"> · {factura.cliente.rut}</span> : null}
              </span>
            </div>
            {factura.empresa && (
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Empresa</span>
                <span className="text-sm text-gray-900 dark:text-white">{factura.empresa.nombre}</span>
              </div>
            )}
            {factura.contacto && (
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Contacto</span>
                <span className="text-sm text-gray-900 dark:text-white">{factura.contacto}</span>
              </div>
            )}
            {factura.correo && (
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Correo</span>
                <span className="text-sm text-gray-900 dark:text-white">{factura.correo}</span>
              </div>
            )}
            <div>
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Fecha emisión</span>
              <span className="text-sm text-gray-900 dark:text-white">{factura.fecha}</span>
            </div>
            {factura.fecha_vencimiento && (
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Vencimiento</span>
                <span className="text-sm text-gray-900 dark:text-white">{factura.fecha_vencimiento}</span>
              </div>
            )}
            {factura.vendedor && (
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Vendedor</span>
                <span className="text-sm text-gray-900 dark:text-white">{factura.vendedor.name}</span>
              </div>
            )}
            {factura.nota && (
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Nota</span>
                <span className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{factura.nota}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment info panel — visible when pagada */}
      {factura.estado === 'pagada' && (
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800 p-4 mb-5">
          <h3 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">Información de pago</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Fecha de pago</span>
              <span className="text-sm text-green-900 dark:text-green-200">{factura.fecha_pago ?? '—'}</span>
            </div>
            <div>
              <span className="block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Monto pagado</span>
              <span className="text-sm text-green-900 dark:text-green-200 font-medium">
                {factura.monto_pagado != null ? fmtMoney(factura.monto_pagado) : '—'}
              </span>
            </div>
            <div>
              <span className="block text-xs font-medium text-green-700 dark:text-green-400 mb-0.5">Método de pago</span>
              <span className="text-sm text-green-900 dark:text-green-200 capitalize">{factura.metodo_pago ?? '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Lines section */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h2>
        {!editingLineas && currentUser?.role === 'admin' && (
          <button
            onClick={() => { setEditingLineas(true); setEditing(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <Pencil size={12} />
            Editar líneas
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 font-medium text-center w-10">Nº</th>
              <th className="px-3 py-3 font-medium w-24">SKU</th>
              <th className="px-3 py-3 font-medium">Descripción</th>
              <th className="px-3 py-3 font-medium w-28">Formato</th>
              <th className="px-3 py-3 font-medium text-right w-20">Cant.</th>
              <th className="px-3 py-3 font-medium text-right w-28">Valor Neto</th>
              <th className="px-3 py-3 font-medium text-right w-28">Total Neto</th>
              <th className="px-3 py-3 font-medium text-right w-24">IVA</th>
              <th className="px-3 py-3 font-medium text-right w-28">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lineas.map((linea, idx) => (
              <tr key={linea._key}>
                <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  {editingLineas ? (
                    <input
                      type="text"
                      value={linea.sku ?? ''}
                      onChange={e => updateLinea(idx, { sku: e.target.value || null })}
                      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="SKU"
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300">{linea.sku ?? '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingLineas ? (
                    <input
                      type="text"
                      value={linea.descripcion}
                      onChange={e => updateLinea(idx, { descripcion: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Descripción..."
                    />
                  ) : (
                    <span className="text-xs text-gray-900 dark:text-white">{linea.descripcion}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingLineas ? (
                    <input
                      type="text"
                      value={linea.formato ?? ''}
                      onChange={e => updateLinea(idx, { formato: e.target.value || null })}
                      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Formato"
                    />
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{linea.formato ?? '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editingLineas ? (
                    <input
                      type="number"
                      min="1"
                      value={linea.cantidad}
                      onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300">{linea.cantidad}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editingLineas ? (
                    <input
                      type="number"
                      min="0"
                      value={linea.valor_neto}
                      onChange={e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300">{fmtMoney(linea.valor_neto)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium">{fmtMoney(linea.total_neto)}</td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs">{fmtMoney(linea.iva)}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium">{fmtMoney(linea.total)}</td>
              </tr>
            ))}
            {lineas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">Sin líneas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 min-w-[260px]">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Total Neto</span><span className="font-medium">{fmtMoney(totalNeto)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>IVA (19%)</span><span className="font-medium">{fmtMoney(totalIva)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 font-bold text-gray-900 dark:text-white text-base">
              <span>Total</span><span>{fmtMoney(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Email toast */}
      {emailToast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <PaymentModal
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
          totalSugerido={factura.total}
        />
      )}
    </div>
  )
}
