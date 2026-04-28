import { openPdf } from '../lib/pdf'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Mail, ArrowLeft, ExternalLink, Pencil, Plus, Trash2, Lock, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Factura, FacturaLinea, Cliente, User, Empresa, Pago, BancoReceptor } from '../types'
import DteBadge from '../components/DteBadge'
import TareasRelacionadas from '../components/TareasRelacionadas'
import {
  Button, Input, Textarea, FormField, Badge, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
  Popover, PopoverTrigger, PopoverContent,
  Tooltip,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

const ESTADO_LABELS: Record<string, string> = {
  emitida: 'Emitida',
  parcial: 'Parcial',
  pagada:  'Pagada',
  anulada: 'Anulada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  emitida: 'info',
  parcial: 'warning',
  pagada:  'success',
  anulada: 'danger',
}

import { METODOS_PAGO, METODO_PAGO_LABELS, PLAZO_OPTIONS, isPlazoForzadoCero, formatMetodoPlazo } from '../lib/metodo_pago'

function getValidTransitions(estado: string): string[] {
  const all: Record<string, string[]> = {
    emitida: ['anulada'],
    parcial: ['anulada'],
    pagada:  ['anulada'],
    anulada: [],
  }
  return all[estado] ?? []
}

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

type LineaLocal = FacturaLinea & { _key: string }

function calcLinea(l: LineaLocal): LineaLocal {
  const cantidad = Number(l.cantidad) || 0
  const valor_neto = Number(l.valor_neto) || 0
  const total_neto = cantidad * valor_neto
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  const total = total_neto + iva
  return { ...l, cantidad, valor_neto, total_neto, iva, total }
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
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [showPagoModal, setShowPagoModal] = useState(false)
  const [emitirOpen, setEmitirOpen] = useState(false)
  const [emitiendo, setEmitiendo] = useState(false)
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().split('T')[0])
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoMetodo, setPagoMetodo] = useState('transferencia')
  const [pagoNota, setPagoNota] = useState('')

  // Form fields
  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>('')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [nota, setNota] = useState('')
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [bancoReceptorId, setBancoReceptorId] = useState<number | null>(null)
  const [metodoPago, setMetodoPago] = useState<string>('')
  const [plazoDias, setPlazoDias] = useState<number>(0)
  const [lineas, setLineas] = useState<LineaLocal[]>([])

  const { data: factura } = useQuery<Factura>({
    queryKey: ['factura', id],
    queryFn: () => api.get(`/api/facturas/${id}`).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (factura) {
      setClienteId(factura.cliente_id ?? '')
      setVendedorId(factura.vendedor_id ?? '')
      setContacto(factura.contacto ?? '')
      setCorreo(factura.correo ?? '')
      setFecha(factura.fecha)
      setFechaVencimiento(factura.fecha_vencimiento ?? '')
      setNota(factura.nota ?? '')
      setEmpresaId(factura.empresa_id ?? '')
      setBancoReceptorId(factura.banco_receptor_id ?? null)
      setMetodoPago(factura.metodo_pago ?? '')
      setPlazoDias(factura.plazo_dias ?? 0)
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

  const { data: bancos = [] } = useQuery<BancoReceptor[]>({
    queryKey: ['bancos-receptores'],
    queryFn: () => api.get('/api/bancos-receptores/').then(r => r.data),
    enabled: editing,
  })

  const { data: pagos = [] } = useQuery<Pago[]>({
    queryKey: ['pagos', id],
    queryFn: () => api.get(`/api/pagos/?factura_id=${id}`).then(r => r.data),
    enabled: !!id,
  })

  const createPagoMut = useMutation({
    mutationFn: (body: object) => api.post('/api/pagos/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos', id] })
      qc.invalidateQueries({ queryKey: ['factura', id] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setShowPagoModal(false)
      setPagoMonto('')
      setPagoNota('')
      setPagoFecha(new Date().toISOString().split('T')[0])
      setPagoMetodo('Transferencia')
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Error al registrar pago'),
  })

  const deletePagoMut = useMutation({
    mutationFn: (pagoId: number) => api.delete(`/api/pagos/${pagoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos', id] })
      qc.invalidateQueries({ queryKey: ['factura', id] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Error al eliminar pago'),
  })

  function updateLinea(idx: number, patch: Partial<LineaLocal>) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })))
  }

  const totalNeto = lineas.reduce((s, l) => s + (Number(l.total_neto) || 0), 0)
  const totalIva = lineas.reduce((s, l) => s + (Number(l.iva) || 0), 0)
  const total = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0)

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
        banco_receptor_id: bancoReceptorId,
        metodo_pago: metodoPago || null,
        plazo_dias: plazoDias,
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
      setClienteId(factura.cliente_id ?? '')
      setVendedorId(factura.vendedor_id ?? '')
      setContacto(factura.contacto ?? '')
      setCorreo(factura.correo ?? '')
      setFecha(factura.fecha)
      setFechaVencimiento(factura.fecha_vencimiento ?? '')
      setNota(factura.nota ?? '')
      setEmpresaId(factura.empresa_id ?? '')
      setBancoReceptorId(factura.banco_receptor_id ?? null)
      setMetodoPago(factura.metodo_pago ?? '')
      setPlazoDias(factura.plazo_dias ?? 0)
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
    mutationFn: (payload: { estado: string }) =>
      api.patch(`/api/facturas/${id}/estado`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['factura', id] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setShowEstadoMenu(false)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al cambiar estado')
      setShowEstadoMenu(false)
    },
  })

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/facturas/${id}/email`),
    onSuccess: () => toast.success('Email enviado correctamente'),
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al enviar email'),
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

  const recotizarMut = useMutation({
    mutationFn: () => api.post(`/api/facturas/${id}/recotizar`).then(r => r.data),
    onSuccess: (data: { id: number; warnings: string[] }) => {
      if (data.warnings.length > 0) {
        toast.warning(`Re-cotización creada con ${data.warnings.length} producto(s) descontinuado(s): ${data.warnings.join(', ')}`, {
          action: { label: 'Ver', onClick: () => navigate(`/cotizaciones/${data.id}`) },
          duration: 8000,
        })
      } else {
        toast.success('Cotización duplicada con precios actualizados', {
          action: { label: 'Ver', onClick: () => navigate(`/cotizaciones/${data.id}`) },
        })
      }
      navigate(`/cotizaciones/${data.id}`)
    },
    onError: () => toast.error('Error al re-cotizar'),
  })

  const validTransitions = factura ? getValidTransitions(factura.estado) : []
  const canDelete = factura?.estado === 'emitida'

  async function handleEmitirDte() {
    setEmitiendo(true)
    try {
      await api.post(`/api/dte/facturas/${factura!.id}/emitir`)
      setEmitirOpen(false)
      window.location.reload()
    } catch {
      alert('Error al emitir DTE. Intente de nuevo.')
    } finally {
      setEmitiendo(false)
    }
  }

  if (!factura) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Tooltip label="Volver">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => navigate('/facturas')}
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </Button>
          </Tooltip>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Tooltip label="Volver">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => navigate('/facturas')}
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </Button>
          </Tooltip>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white font-num">
            FAC-{String(factura.numero).padStart(5, '0')}
          </h1>
          <Badge variant={ESTADO_VARIANT[factura.estado] ?? 'neutral'} size="sm">
            {ESTADO_LABELS[factura.estado] ?? factura.estado}
          </Badge>
          <DteBadge estado={factura.dte_estado ?? 'no_emitida'} />
          {(factura.dte_estado === 'no_emitida' || !factura.dte_estado) && (
            <Button size="xs" onClick={() => setEmitirOpen(true)}>
              Emitir DTE
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {validTransitions.length > 0 && (
            <Popover open={showEstadoMenu} onOpenChange={setShowEstadoMenu}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">Cambiar estado</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-1 min-w-[160px]">
                {validTransitions.map(t => (
                  <button
                    key={t}
                    onClick={() => estadoMut.mutate({ estado: t })}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    → {ESTADO_LABELS[t] ?? t}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <Button
            size="sm"
            variant="outline"
            leftIcon={<FileText />}
            onClick={() => openPdf(`/api/facturas/${id}/pdf`)}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Mail />}
            onClick={() => emailMut.mutate()}
            disabled={emailMut.isPending}
            loading={emailMut.isPending}
          >
            Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RotateCcw />}
            onClick={() => recotizarMut.mutate()}
            loading={recotizarMut.isPending}
            disabled={recotizarMut.isPending}
          >
            Re-cotizar
          </Button>
          {!factura?.is_locked && (
            !editing ? (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Pencil />}
                onClick={() => setEditing(true)}
                className="border-brand-300 text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                Editar
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}>
                  Guardar
                </Button>
              </>
            )
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm('¿Eliminar esta factura?')) deleteMut.mutate()
              }}
              className="border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-500/10"
            >
              Eliminar
            </Button>
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
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline font-num"
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
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline font-num"
              >
                COT-{String(factura.cotizacion?.numero ?? factura.cotizacion_id).padStart(5, '0')}
                <ExternalLink size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {factura?.is_locked && (
        <div className="mb-4 rounded-lg border border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-500/10 px-4 py-3 text-sm text-warning-800 dark:text-warning-300 flex items-center gap-2">
          <Lock size={15} />
          Esta factura no es editable en su estado actual.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-600 dark:text-danger-400">
          {error}
        </div>
      )}

      {/* Header card */}
      <Card className="mb-5">
        <CardContent className="p-5">
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="Cliente" required>
                <Select
                  value={clienteId ? String(clienteId) : ''}
                  onValueChange={v => setClienteId(v ? Number(v) : '')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}{c.rut ? ` · ${c.rut}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Empresa">
                <Select
                  value={empresaId ? String(empresaId) : 'none'}
                  onValueChange={v => setEmpresaId(v === 'none' ? '' : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin empresa —</SelectItem>
                    {empresas.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Banco de recepción">
                <Select
                  value={bancoReceptorId !== null ? String(bancoReceptorId) : 'none'}
                  onValueChange={v => setBancoReceptorId(v === 'none' ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {bancos
                      .filter(b => b.activo || b.id === bancoReceptorId)
                      .map(b => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.nombre}{!b.activo ? ' (inactivo)' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Método de pago">
                <Select
                  value={metodoPago || 'none'}
                  onValueChange={v => {
                    const m = v === 'none' ? '' : v
                    setMetodoPago(m)
                    if (m && isPlazoForzadoCero(m)) setPlazoDias(0)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {METODOS_PAGO.map(m => (
                      <SelectItem key={m} value={m}>{METODO_PAGO_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Plazo de pago">
                <Select
                  value={String(plazoDias)}
                  onValueChange={v => setPlazoDias(Number(v))}
                  disabled={!!metodoPago && isPlazoForzadoCero(metodoPago)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAZO_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                    {!PLAZO_OPTIONS.some(o => o.value === plazoDias) && (
                      <SelectItem value={String(plazoDias)}>{plazoDias} días</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Contacto">
                <Input
                  type="text"
                  value={contacto}
                  onChange={e => setContacto(e.target.value)}
                  placeholder="Nombre del contacto"
                />
              </FormField>

              <FormField label="Correo">
                <Input
                  type="email"
                  value={correo}
                  onChange={e => setCorreo(e.target.value)}
                  placeholder="email@ejemplo.com"
                />
              </FormField>

              <FormField label="Fecha emisión">
                <Input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                />
              </FormField>

              <FormField label="Fecha vencimiento">
                <Input
                  type="date"
                  value={fechaVencimiento}
                  onChange={e => setFechaVencimiento(e.target.value)}
                />
              </FormField>

              {isAdmin && (
                <FormField label="Vendedor">
                  <Select
                    value={vendedorId ? String(vendedorId) : 'none'}
                    onValueChange={v => setVendedorId(v === 'none' ? '' : Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin asignar —</SelectItem>
                      {usuarios.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              <FormField label="Nota / Observaciones" className="sm:col-span-2 lg:col-span-3">
                <Textarea
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  rows={2}
                  placeholder="Notas internas o para el cliente..."
                />
              </FormField>
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
              {factura.banco_receptor && (
                <div>
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Banco de recepción</span>
                  <span className="text-sm text-gray-900 dark:text-white">{factura.banco_receptor.nombre}</span>
                </div>
              )}
              {factura.metodo_pago && (
                <div>
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Método de pago</span>
                  <span className="text-sm text-gray-900 dark:text-white">{formatMetodoPlazo(factura.metodo_pago, factura.plazo_dias ?? 0)}</span>
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
                <span className="text-sm text-gray-900 dark:text-white font-num">{factura.fecha}</span>
              </div>
              {factura.fecha_vencimiento && (
                <div>
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Vencimiento</span>
                  <span className="text-sm text-gray-900 dark:text-white font-num">{factura.fecha_vencimiento}</span>
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
        </CardContent>
      </Card>

      {/* Pagos section */}
      {factura.estado !== 'anulada' && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Abonos / Pagos</h2>
              {pagos.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Pagado: <span className="font-medium text-gray-700 dark:text-gray-200 font-num">{fmtMoney(pagos.reduce((s, p) => s + Number(p.monto), 0))}</span>
                  {' · '}Saldo: <span className={`font-medium font-num ${Number(factura.monto_pagado ?? 0) >= Number(factura.total) ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}`}>
                    {fmtMoney(Number(factura.total) - Number(factura.monto_pagado ?? 0))}
                  </span>
                </span>
              )}
            </div>
            {factura.estado !== 'pagada' && (
              <Button size="xs" leftIcon={<Plus />} onClick={() => setShowPagoModal(true)}>
                Registrar abono
              </Button>
            )}
          </div>
          <Card className="overflow-hidden">
            {pagos.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-400 dark:text-gray-500 text-center">Sin pagos registrados</p>
            ) : (
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH className="text-right">Monto</TH>
                    <TH>Método</TH>
                    <TH>Nota</TH>
                    <TH>Registrado por</TH>
                    {isAdmin && <TH className="w-10" />}
                  </TR>
                </THead>
                <TBody>
                  {pagos.map(p => (
                    <TR key={p.id}>
                      <TD className="font-num">{p.fecha}</TD>
                      <TD className="text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(p.monto)}</TD>
                      <TD className="text-gray-600 dark:text-gray-400 capitalize">{p.metodo_pago}</TD>
                      <TD className="text-gray-500 dark:text-gray-400 text-xs max-w-[160px] truncate">{p.nota ?? '—'}</TD>
                      <TD className="text-gray-500 dark:text-gray-400 text-xs">{p.registrado_por?.name ?? '—'}</TD>
                      {isAdmin && (
                        <TD>
                          <Tooltip label="Eliminar abono">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => { if (window.confirm('¿Eliminar este abono?')) deletePagoMut.mutate(p.id) }}
                              aria-label="Eliminar abono"
                              className="text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </Tooltip>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Lines section */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h2>
        {!factura?.is_locked && !editingLineas && currentUser?.role === 'admin' && (
          <Button
            size="xs"
            variant="outline"
            leftIcon={<Pencil />}
            onClick={() => { setEditingLineas(true); setEditing(true) }}
            className="border-brand-300 text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400 dark:hover:bg-brand-500/10"
          >
            Editar líneas
          </Button>
        )}
      </div>

      <Card className="mb-4 overflow-x-auto">
        <Table density="compact" className="min-w-[800px]">
          <THead>
            <TR>
              <TH className="text-center w-10">Nº</TH>
              <TH className="w-24">SKU</TH>
              <TH>Descripción</TH>
              <TH className="w-28">Formato</TH>
              <TH className="text-right w-20">Cant.</TH>
              <TH className="text-right w-28">Valor Neto</TH>
              <TH className="text-right w-28">Total Neto</TH>
              <TH className="text-right w-24">IVA</TH>
              <TH className="text-right w-28">Total</TH>
            </TR>
          </THead>
          <TBody>
            {lineas.map((linea, idx) => (
              <TR key={linea._key}>
                <TD className="text-center text-gray-500 dark:text-gray-400 font-num">{idx + 1}</TD>
                <TD>
                  {editingLineas ? (
                    <Input
                      size="sm"
                      type="text"
                      value={linea.sku ?? ''}
                      onChange={e => updateLinea(idx, { sku: e.target.value || null })}
                      placeholder="SKU"
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300">{linea.sku ?? '—'}</span>
                  )}
                </TD>
                <TD>
                  {editingLineas ? (
                    <Input
                      size="sm"
                      type="text"
                      value={linea.descripcion}
                      onChange={e => updateLinea(idx, { descripcion: e.target.value })}
                      placeholder="Descripción..."
                    />
                  ) : (
                    <span className="text-xs text-gray-900 dark:text-white">{linea.descripcion}</span>
                  )}
                </TD>
                <TD>
                  {editingLineas ? (
                    <Input
                      size="sm"
                      type="text"
                      value={linea.formato ?? ''}
                      onChange={e => updateLinea(idx, { formato: e.target.value || null })}
                      placeholder="Formato"
                    />
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{linea.formato ?? '—'}</span>
                  )}
                </TD>
                <TD className="text-right">
                  {editingLineas ? (
                    <Input
                      size="sm"
                      type="number"
                      min="1"
                      className="text-right"
                      value={linea.cantidad}
                      onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-num">{linea.cantidad}</span>
                  )}
                </TD>
                <TD className="text-right">
                  {editingLineas ? (
                    <Input
                      size="sm"
                      type="number"
                      min="0"
                      className="text-right"
                      value={linea.valor_neto}
                      onChange={e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 })}
                    />
                  ) : (
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-num">{fmtMoney(linea.valor_neto)}</span>
                  )}
                </TD>
                <TD className="text-right text-gray-700 dark:text-gray-300 text-xs font-medium font-num">{fmtMoney(linea.total_neto)}</TD>
                <TD className="text-right text-gray-500 dark:text-gray-400 text-xs font-num">{fmtMoney(linea.iva)}</TD>
                <TD className="text-right text-gray-900 dark:text-white text-xs font-medium font-num">{fmtMoney(linea.total)}</TD>
              </TR>
            ))}
            {lineas.length === 0 && (
              <TR>
                <TD colSpan={9} className="text-center text-xs text-gray-400 dark:text-gray-500 py-6">Sin líneas</TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <Card className="min-w-[260px]">
          <CardContent className="p-4">
            <div className="space-y-1.5 text-sm font-num">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Total Neto</span><span className="font-medium">{fmtMoney(totalNeto)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>IVA (19%)</span><span className="font-medium">{fmtMoney(totalIva)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-800 pt-1.5 font-bold text-gray-900 dark:text-white text-base">
                <span>Total</span><span>{fmtMoney(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TareasRelacionadas tipo="factura" id={factura.id} />

      {/* DTE emitir modal */}
      <Modal open={emitirOpen} onOpenChange={setEmitirOpen}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Emitir Factura Electrónica?</ModalTitle>
            <ModalDescription>Esta acción enviará el documento al SII via Lioren.</ModalDescription>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Total:</span>{' '}
              <span className="font-num">${Number(factura.total).toLocaleString('es-CL')}</span>
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setEmitirOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEmitirDte} loading={emitiendo} disabled={emitiendo}>
              {emitiendo ? 'Enviando...' : 'Confirmar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Pago modal */}
      <Modal open={showPagoModal} onOpenChange={setShowPagoModal}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Registrar abono</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <FormField label="Fecha">
                <Input
                  type="date"
                  value={pagoFecha}
                  onChange={e => setPagoFecha(e.target.value)}
                />
              </FormField>
              <FormField label={`Monto (saldo: ${fmtMoney(Number(factura.total) - Number(factura.monto_pagado ?? 0))})`}>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={pagoMonto}
                  onChange={e => setPagoMonto(e.target.value)}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Método de pago">
                <Select value={pagoMetodo} onValueChange={v => setPagoMetodo(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOS_PAGO.map(m => (
                      <SelectItem key={m} value={m}>{METODO_PAGO_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Nota (opcional)">
                <Input
                  type="text"
                  value={pagoNota}
                  onChange={e => setPagoNota(e.target.value)}
                  placeholder="Referencia, número de transferencia..."
                />
              </FormField>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowPagoModal(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!pagoMonto || createPagoMut.isPending}
              loading={createPagoMut.isPending}
              onClick={() => createPagoMut.mutate({ factura_id: Number(id), fecha: pagoFecha, monto: Number(pagoMonto), metodo_pago: pagoMetodo, nota: pagoNota || null })}
            >
              {createPagoMut.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
