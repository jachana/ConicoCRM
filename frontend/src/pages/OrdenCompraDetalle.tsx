import { openPdf } from '../lib/pdf'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, FileText, Mail, ArrowLeft, PackageCheck, Save, Ban } from 'lucide-react'
import { api } from '../lib/api'
import type { OrdenCompra, OrdenCompraLinea, Proveedor, Producto } from '../types'
import {
  Button, Input, Textarea, FormField, Badge, Card, CardContent, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
} from '../components/ui'

type LineaLocal = Omit<OrdenCompraLinea, 'id'> & { id?: number; _key: string }

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Recibida parcial',
  recibida_completa: 'Recibida completa',
  cancelada: 'Cancelada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  borrador: 'neutral',
  enviada: 'info',
  recibida_parcial: 'warning',
  recibida_completa: 'success',
  cancelada: 'danger',
}

function newLinea(orden: number): LineaLocal {
  return { _key: `${Date.now()}-${orden}`, orden, producto_id: null, sku: null, descripcion: '', cantidad: 1, cantidad_recibida: 0, valor_neto: 0, total_neto: 0, iva: 0, total: 0 }
}

function calcLinea(l: LineaLocal): LineaLocal {
  const cantidad = Number(l.cantidad) || 0
  const valor_neto = Number(l.valor_neto) || 0
  const total_neto = cantidad * valor_neto
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  return { ...l, total_neto, iva, total: total_neto + iva }
}

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

const READONLY_ESTADOS = ['recibida_completa', 'cancelada']

export default function OrdenCompraDetalle() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id || id === 'nueva'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [proveedorId, setProveedorId] = useState<number | ''>('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaLocal[]>([newLinea(1)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])

  const [recepcionCantidades, setRecepcionCantidades] = useState<Record<number, number>>({})
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showRecepcionModal, setShowRecepcionModal] = useState(false)

  const { data: orden } = useQuery<OrdenCompra>({
    queryKey: ['orden_compra', id],
    queryFn: () => api.get(`/api/ordenes-compra/${id}`).then(r => r.data),
    enabled: !isNew,
  })

  useEffect(() => {
    if (orden) {
      setProveedorId(orden.proveedor_id)
      setFecha(orden.fecha)
      setFechaEntrega(orden.fecha_entrega_esperada ?? '')
      setNota(orden.nota ?? '')
      setLineas((orden.lineas ?? []).map((l, i) => ({ ...l, _key: `${l.id ?? i}`, producto_id: l.producto_id ?? null, sku: l.sku ?? null })))
      const initial: Record<number, number> = {}
      for (const l of orden.lineas ?? []) {
        if (l.id != null) initial[l.id] = l.cantidad_recibida
      }
      setRecepcionCantidades(initial)
    }
  }, [orden])

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const estado = orden?.estado ?? 'borrador'
  const isReadonly = READONLY_ESTADOS.includes(estado)
  const canEdit = isNew || estado === 'borrador'
  const canReceive = estado === 'enviada' || estado === 'recibida_parcial'

  async function handleProductoSearch(idx: number, term: string) {
    if (!term || term.length < 2) { setAutocompleteResults([]); setAutocompleteIdx(null); return }
    const r = await api.get(`/api/productos/buscar?q=${encodeURIComponent(term)}`)
    setAutocompleteResults(r.data)
    setAutocompleteIdx(idx)
  }

  function seleccionarProducto(idx: number, producto: Producto) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, producto_id: producto.id, sku: producto.sku ?? null, descripcion: producto.nombre, valor_neto: Number(producto.precio_costo ?? 0) })))
    setAutocompleteResults([])
    setAutocompleteIdx(null)
  }

  function updateLinea(idx: number, field: keyof LineaLocal, value: any) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, [field]: value })))
  }

  function addLinea() {
    setLineas(prev => [...prev, newLinea(prev.length + 1)])
  }

  function removeLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, orden: i + 1 })))
  }

  const totalNeto = lineas.reduce((s, l) => s + (Number(l.total_neto) || 0), 0)
  const totalIva = lineas.reduce((s, l) => s + (Number(l.iva) || 0), 0)
  const total = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0)

  async function guardar() {
    if (!proveedorId) { setError('Selecciona un proveedor'); return }
    setSaving(true); setError('')
    try {
      const lineasPayload = lineas.map(l => ({
        orden: l.orden, producto_id: l.producto_id, sku: l.sku, descripcion: l.descripcion, cantidad: l.cantidad, valor_neto: l.valor_neto
      }))
      if (isNew) {
        const r = await api.post('/api/ordenes-compra/', { proveedor_id: proveedorId, fecha, fecha_entrega_esperada: fechaEntrega || null, nota: nota || null, lineas: lineasPayload })
        qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
        toast.success('Orden de compra creada')
        navigate(`/ordenes-compra/${r.data.id}`)
      } else {
        await api.patch(`/api/ordenes-compra/${id}`, { proveedor_id: proveedorId, fecha, fecha_entrega_esperada: fechaEntrega || null, nota: nota || null })
        await api.put(`/api/ordenes-compra/${id}/lineas`, lineasPayload)
        qc.invalidateQueries({ queryKey: ['orden_compra', id] })
        qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
        toast.success('Orden de compra actualizada')
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Error al guardar'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/ordenes-compra/${id}/email`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden_compra', id] })
      qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
      toast.success('Email enviado. OC marcada como enviada.')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail || 'Error al enviar email')
    },
  })

  const cancelarMut = useMutation({
    mutationFn: () => api.patch(`/api/ordenes-compra/${id}/estado`, { estado: 'cancelada' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden_compra', id] })
      qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
      setConfirmCancel(false)
      toast.success('OC cancelada')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || 'Error al cancelar'
      setError(msg)
      toast.error(msg)
    },
  })

  const recepcionarMut = useMutation({
    mutationFn: () => {
      const lineasPayload = Object.entries(recepcionCantidades).map(([linea_id, cantidad_recibida]) => ({
        id: Number(linea_id),
        cantidad_recibida,
      }))
      return api.post(`/api/ordenes-compra/${id}/recepcionar`, { lineas: lineasPayload })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden_compra', id] })
      qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
      setShowRecepcionModal(false)
      toast.success('Recepción registrada')
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || 'Error al recepcionar'
      setError(msg)
      toast.error(msg)
    },
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tooltip label="Volver">
          <Button size="icon-sm" variant="ghost" onClick={() => navigate('/ordenes-compra')} aria-label="Volver">
            <ArrowLeft />
          </Button>
        </Tooltip>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {isNew ? 'Nueva Orden de Compra' : `OC-${String(orden?.numero ?? '').padStart(5, '0')}`}
        </h1>
        {orden && (
          <Badge variant={ESTADO_VARIANT[estado] ?? 'neutral'} size="sm">
            {ESTADO_LABELS[estado] ?? estado}
          </Badge>
        )}
      </div>

      {/* Banner: anulada / readonly */}
      {orden && estado === 'cancelada' && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
          Esta orden de compra fue cancelada.
        </div>
      )}
      {orden && estado === 'recibida_completa' && (
        <div className="mb-4 px-4 py-3 bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-800 rounded-lg text-sm text-success-700 dark:text-success-300">
          Esta orden de compra fue recibida completamente.
        </div>
      )}
      {!isNew && isReadonly && (
        <div className="mb-4 px-4 py-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-800 rounded-lg text-sm text-warning-700 dark:text-warning-300">
          Solo lectura. No se puede modificar esta OC.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
          {error}
        </div>
      )}

      {/* Form */}
      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <FormField label="Proveedor" required>
                <Select
                  value={proveedorId === '' ? 'none' : String(proveedorId)}
                  onValueChange={v => setProveedorId(v === 'none' ? '' : Number(v))}
                  disabled={!canEdit}
                >
                  <SelectTrigger size="md"><SelectValue placeholder="Seleccionar proveedor..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Seleccionar proveedor...</SelectItem>
                    {proveedores.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Fecha">
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} disabled={!canEdit} />
            </FormField>
            <FormField label="Entrega esperada">
              <Input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} disabled={!canEdit} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Nota">
                <Textarea value={nota} onChange={e => setNota(e.target.value)} disabled={!canEdit} rows={2} className="resize-none" />
              </FormField>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line editor */}
      <Card className="mb-5">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Líneas</h2>
          <div className="overflow-x-auto">
            <Table density="compact">
              <THead>
                <TR>
                  <TH className="w-8">Nº</TH>
                  <TH>Producto / Descripción</TH>
                  <TH className="w-24">SKU</TH>
                  <TH className="text-right w-16">Cant.</TH>
                  <TH className="text-right w-28">Valor Neto</TH>
                  <TH className="text-right w-28">Total Neto</TH>
                  <TH className="text-right w-24">IVA</TH>
                  <TH className="text-right w-28">Total</TH>
                  {canEdit && <TH className="w-8" />}
                </TR>
              </THead>
              <TBody>
                {lineas.map((l, idx) => (
                  <TR key={l._key}>
                    <TD className="text-gray-400 font-num">{idx + 1}</TD>
                    <TD className="relative">
                      <Input
                        size="sm"
                        value={l.descripcion}
                        onChange={e => { updateLinea(idx, 'descripcion', e.target.value); handleProductoSearch(idx, e.target.value) }}
                        disabled={!canEdit}
                        placeholder="Descripción o buscar producto..."
                      />
                      {autocompleteIdx === idx && autocompleteResults.length > 0 && (
                        <div className="absolute top-full left-0 z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-elev-3 max-h-48 overflow-y-auto mt-1">
                          {autocompleteResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => seleccionarProducto(idx, p)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              {p.nombre} {p.sku ? `(${p.sku})` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Input size="sm" value={l.sku ?? ''} onChange={e => updateLinea(idx, 'sku', e.target.value || null)} disabled={!canEdit} placeholder="SKU" />
                    </TD>
                    <TD>
                      <Input size="sm" type="number" min={1} value={l.cantidad} onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))} disabled={!canEdit} className="text-right font-num" />
                    </TD>
                    <TD>
                      <Input size="sm" type="number" min={0} value={l.valor_neto} onChange={e => updateLinea(idx, 'valor_neto', Number(e.target.value))} disabled={!canEdit} className="text-right font-num" />
                    </TD>
                    <TD className="text-right text-gray-700 dark:text-gray-300 font-num">{fmtMoney(l.total_neto)}</TD>
                    <TD className="text-right text-gray-500 font-num">{fmtMoney(l.iva)}</TD>
                    <TD className="text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(l.total)}</TD>
                    {canEdit && (
                      <TD>
                        <Tooltip label="Eliminar línea">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => removeLinea(idx)}
                            aria-label="Eliminar línea"
                            className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                          >
                            <Trash2 />
                          </Button>
                        </Tooltip>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {canEdit && (
            <Button variant="link" size="sm" leftIcon={<Plus />} onClick={addLinea} className="mt-3 px-0">
              Agregar línea
            </Button>
          )}
          <div className="mt-4 flex justify-end">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-8 text-gray-500">Total Neto</td>
                  <td className="text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(totalNeto)}</td>
                </tr>
                <tr>
                  <td className="pr-8 text-gray-500">IVA (19%)</td>
                  <td className="text-right font-medium text-gray-900 dark:text-white font-num">{fmtMoney(totalIva)}</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-700">
                  <td className="pr-8 font-semibold text-gray-900 dark:text-white pt-2">TOTAL</td>
                  <td className="text-right font-bold text-info-600 dark:text-info-400 pt-2 font-num">{fmtMoney(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {canEdit && (
          <Button leftIcon={<Save />} onClick={guardar} loading={saving} disabled={saving}>
            Guardar
          </Button>
        )}
        {!isNew && estado === 'borrador' && (
          <>
            <Button
              variant="success"
              leftIcon={<Mail />}
              onClick={() => emailMut.mutate()}
              loading={emailMut.isPending}
              disabled={emailMut.isPending}
            >
              Enviar por Email
            </Button>
            <Button
              variant="outline"
              leftIcon={<Ban />}
              onClick={() => setConfirmCancel(true)}
              className="border-danger-300 text-danger-600 hover:bg-danger-50 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-500/10"
            >
              Cancelar OC
            </Button>
          </>
        )}
        {!isNew && (
          <Button variant="outline" leftIcon={<FileText />} onClick={() => openPdf(`/api/ordenes-compra/${id}/pdf`)}>
            Ver PDF
          </Button>
        )}
        {!isNew && canReceive && (
          <Button
            leftIcon={<PackageCheck />}
            onClick={() => setShowRecepcionModal(true)}
            className="bg-warning-500 hover:bg-warning-600 focus-visible:ring-warning-500"
          >
            Recepcionar mercadería
          </Button>
        )}
      </div>

      {/* Reception inline panel (also accessible via modal) */}
      {!isNew && canReceive && (
        <Card className="border-warning-200 dark:border-warning-800">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-warning-700 dark:text-warning-400 mb-3 flex items-center gap-2">
              <PackageCheck size={16} /> Recepción de mercadería
            </h2>
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Descripción</TH>
                  <TH className="text-right">Pedido</TH>
                  <TH className="text-right">Ya recibido</TH>
                  <TH className="text-right">Recibir ahora</TH>
                </TR>
              </THead>
              <TBody>
                {(orden?.lineas ?? []).map(l => (
                  <TR key={l.id}>
                    <TD className="text-gray-900 dark:text-white">{l.descripcion}</TD>
                    <TD className="text-right text-gray-700 dark:text-gray-300 font-num">{l.cantidad}</TD>
                    <TD className="text-right text-success-600 dark:text-success-400 font-num">{l.cantidad_recibida}</TD>
                    <TD className="text-right">
                      <Input
                        size="sm"
                        type="number"
                        min={l.cantidad_recibida}
                        max={l.cantidad}
                        value={l.id != null ? (recepcionCantidades[l.id] ?? l.cantidad_recibida) : l.cantidad_recibida}
                        onChange={e => l.id != null && setRecepcionCantidades(prev => ({ ...prev, [l.id!]: Number(e.target.value) }))}
                        className="w-20 text-right font-num inline-block"
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-4">
              <Button
                leftIcon={<PackageCheck />}
                onClick={() => recepcionarMut.mutate()}
                loading={recepcionarMut.isPending}
                disabled={recepcionarMut.isPending}
                className="bg-warning-500 hover:bg-warning-600 focus-visible:ring-warning-500"
              >
                Confirmar recepción
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel confirm modal */}
      <Modal open={confirmCancel} onOpenChange={setConfirmCancel}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Cancelar orden de compra</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              ¿Seguro que deseas cancelar esta orden de compra? Esta acción no se puede deshacer.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={cancelarMut.isPending}>
              Volver
            </Button>
            <Button
              variant="danger"
              onClick={() => cancelarMut.mutate()}
              loading={cancelarMut.isPending}
              disabled={cancelarMut.isPending}
            >
              Cancelar OC
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Recepción modal (alternate trigger from action bar) */}
      <Modal open={showRecepcionModal} onOpenChange={setShowRecepcionModal}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>Recepcionar mercadería</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Descripción</TH>
                  <TH className="text-right">Pedido</TH>
                  <TH className="text-right">Ya recibido</TH>
                  <TH className="text-right">Recibir ahora</TH>
                </TR>
              </THead>
              <TBody>
                {(orden?.lineas ?? []).map(l => (
                  <TR key={l.id}>
                    <TD className="text-gray-900 dark:text-white">{l.descripcion}</TD>
                    <TD className="text-right text-gray-700 dark:text-gray-300 font-num">{l.cantidad}</TD>
                    <TD className="text-right text-success-600 dark:text-success-400 font-num">{l.cantidad_recibida}</TD>
                    <TD className="text-right">
                      <Input
                        size="sm"
                        type="number"
                        min={l.cantidad_recibida}
                        max={l.cantidad}
                        value={l.id != null ? (recepcionCantidades[l.id] ?? l.cantidad_recibida) : l.cantidad_recibida}
                        onChange={e => l.id != null && setRecepcionCantidades(prev => ({ ...prev, [l.id!]: Number(e.target.value) }))}
                        className="w-24 text-right font-num inline-block"
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowRecepcionModal(false)} disabled={recepcionarMut.isPending}>
              Cerrar
            </Button>
            <Button
              leftIcon={<PackageCheck />}
              onClick={() => recepcionarMut.mutate()}
              loading={recepcionarMut.isPending}
              disabled={recepcionarMut.isPending}
              className="bg-warning-500 hover:bg-warning-600 focus-visible:ring-warning-500"
            >
              Confirmar recepción
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
