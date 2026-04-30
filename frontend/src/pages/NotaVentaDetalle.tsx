import { openPdf } from '../lib/pdf'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, FileText, Mail, ArrowLeft, ExternalLink, Receipt, Truck, Lock, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { METODOS_PAGO, METODO_PAGO_LABELS, PLAZO_OPTIONS, isPlazoForzadoCero, formatMetodoPlazo } from '../lib/metodo_pago'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import type { NotaVenta, NotaVentaLinea, Cliente, User, Producto, Empresa, SedeDespacho } from '../types'
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
import UnsavedChangesModal from '../components/UnsavedChangesModal'
import TareasRelacionadas from '../components/TareasRelacionadas'
import NotaVentaAdjuntos from '../components/NotaVentaAdjuntos'
import {
  Button, Input, Textarea, FormField, Badge, Card, CardContent, CardHeader,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Popover, PopoverTrigger, PopoverContent,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter,
  Table, THead, TBody, TR, TH, TD,
} from '../components/ui'

type LineaLocal = Omit<NotaVentaLinea, 'id'> & { id?: number; _key: string }

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
  facturada:  'Facturada',
}

const ESTADO_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pendiente:  'neutral',
  despachada: 'info',
  entregada:  'warning',
  pagada:     'success',
  cancelada:  'danger',
  facturada:  'success',
}

function getValidTransitions(estado: string, isAdmin: boolean): string[] {
  const adminOnly = ['pagada', 'cancelada']
  const all: Record<string, string[]> = {
    pendiente:  ['despachada', 'cancelada'],
    despachada: ['entregada', 'cancelada'],
    entregada:  ['pagada', 'cancelada'],
  }
  const targets = all[estado] ?? []
  return isAdmin ? targets : targets.filter(t => !adminOnly.includes(t))
}

function newLinea(orden: number): LineaLocal {
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
  }
}

function calcLinea(l: LineaLocal): LineaLocal {
  const cantidad = Number(l.cantidad) || 0
  const valor_neto = Number(l.valor_neto) || 0
  const total_neto = cantidad * valor_neto
  const iva = Math.round(total_neto * 0.19 * 100) / 100
  const total = total_neto + iva
  return { ...l, cantidad, valor_neto, total_neto, iva, total }
}

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

function getLineasErrors(lineas: LineaLocal[]): string[] {
  const errors: string[] = []
  if (lineas.some(l => l.producto_id === null || l.producto_id === undefined))
    errors.push('Hay líneas sin producto seleccionado')
  if (lineas.some(l => l.margen !== null && l.margen !== undefined && Number(l.margen) < 0))
    errors.push('Hay líneas con margen negativo')
  return errors
}

function nvSnapshot(nv: NotaVenta): string {
  return JSON.stringify({
    clienteId: nv.cliente_id,
    vendedorId: nv.vendedor_id ?? '',
    contacto: nv.contacto ?? '',
    correo: nv.correo ?? '',
    fecha: nv.fecha,
    nota: nv.nota ?? '',
    empresaId: nv.empresa_id ?? '',
    retiroEnConico: nv.retiro_en_conico ?? false,
    sedeDespachoId: nv.sede_despacho_id ?? null,
    metodoPago: nv.metodo_pago ?? '',
    plazoDias: nv.plazo_dias ?? 0,
    numeroOcCliente: nv.numero_oc_cliente ?? '',
    lineas: (nv.lineas ?? []).map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  })
}

export default function NotaVentaDetalle() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id || id === 'nueva'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'
  const { role: effectiveRole } = useEffectivePermissions()
  const isVendedor = (effectiveRole ?? currentUser?.role) === 'vendedor'

  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>(currentUser?.id ?? '')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nota, setNota] = useState('')
  const [retiroEnConico, setRetiroEnConico] = useState(false)
  const [sedeDespachoId, setSedeDespachoId] = useState<number | null>(null)
  const [metodoPago, setMetodoPago] = useState<string>('')
  const [plazoDias, setPlazoDias] = useState<number>(0)
  const [numeroOcCliente, setNumeroOcCliente] = useState<string>('')
  const [sedes, setSedes] = useState<SedeDespacho[]>([])
  const [lineas, setLineas] = useState<LineaLocal[]>([newLinea(1)])
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false)
  const [creditModal, setCreditModal] = useState<{
    credito: CreditoInfo
    aprobacionPayload?: AprobacionPayload
    adminOverride?: boolean
  } | null>(null)

  const [unsavedModal, setUnsavedModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [genFacturaOpen, setGenFacturaOpen] = useState(false)
  const [tipoDteFactura, setTipoDteFactura] = useState<'033' | '034'>('033')
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, nota, empresaId,
    retiroEnConico, sedeDespachoId, metodoPago, plazoDias, numeroOcCliente,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, nota, empresaId, retiroEnConico, sedeDespachoId, metodoPago, plazoDias, numeroOcCliente, lineas])

  const isDirty = !isNew && savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const savedParsed = useMemo(() => (savedSnapshot && !isNew) ? JSON.parse(savedSnapshot) : null, [savedSnapshot, isNew])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const df = (field: string, val: any) => savedParsed !== null && savedParsed[field] !== val
  const lineaDirty = (idx: number) => {
    if (!savedParsed) return false
    const saved = (savedParsed.lineas ?? []) as Array<{ producto_id: number | null; cantidad: number; valor_neto: number; descripcion: string; sku: string | null; formato: string | null }>
    if (idx >= saved.length) return true
    const s = saved[idx], c = lineas[idx]
    return s.producto_id !== (c.producto_id ?? null) || s.cantidad !== c.cantidad ||
      s.valor_neto !== c.valor_neto || s.descripcion !== (c.descripcion ?? '') ||
      s.sku !== (c.sku ?? null) || s.formato !== (c.formato ?? null)
  }

  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])

  const { data: nv } = useQuery<NotaVenta>({
    queryKey: ['nota_venta', id],
    queryFn: () => api.get(`/api/nota_ventas/${id}`).then(r => r.data),
    enabled: !isNew,
  })

  useEffect(() => {
    if (nv) {
      setClienteId(nv.cliente_id)
      setVendedorId(nv.vendedor_id ?? '')
      setContacto(nv.contacto ?? '')
      setCorreo(nv.correo ?? '')
      setFecha(nv.fecha)
      setNota(nv.nota ?? '')
      setRetiroEnConico(nv.retiro_en_conico ?? false)
      setSedeDespachoId(nv.sede_despacho_id ?? null)
      setMetodoPago(nv.metodo_pago ?? '')
      setPlazoDias(nv.plazo_dias ?? 0)
      setNumeroOcCliente(nv.numero_oc_cliente ?? '')
      setEmpresaId(nv.empresa_id ?? '')
      setLineas(
        (nv.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
        }))
      )
      setSavedSnapshot(nvSnapshot(nv))
    }
  }, [nv])

  useEffect(() => {
    if (empresaId) {
      api.get(`/api/sedes-despacho/?empresa_id=${empresaId}`)
        .then(r => setSedes(r.data))
        .catch(() => setSedes([]))
    } else {
      setSedes([])
    }
  }, [empresaId])

  const { data: clientes = [] } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    enabled: isAdmin,
  })

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  const selectedEmpresa = empresas.find(e => e.id === empresaId) ?? null
  const empresaSinCredito = selectedEmpresa != null && (selectedEmpresa.linea_credito == null || selectedEmpresa.linea_credito <= 0)
  const isLocked = nv?.is_locked ?? false

  function handleClienteChange(cid: number | '') {
    setClienteId(cid)
    if (cid) {
      const c = clientes.find(cl => cl.id === cid)
      if (c) {
        if (!contacto) setContacto(c.nombre)
        if (!correo && c.email) setCorreo(c.email)
        if (c.empresa_id && !empresaId) { setEmpresaId(c.empresa_id); setSedeDespachoId(null) }
      }
    }
  }

  const fetchAutocomplete = useCallback(async (q: string) => {
    try {
      if (q.trim() !== '') {
        const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
        setAutocompleteResults(res.data)
        return
      }
      if (empresaId) {
        const res = await api.get<Producto[]>(`/api/productos/sugerencias?empresa_id=${empresaId}`)
        setAutocompleteResults(res.data)
        return
      }
      if (clienteId) {
        const res = await api.get<Producto[]>(`/api/productos/sugerencias?cliente_id=${clienteId}`)
        setAutocompleteResults(res.data)
        return
      }
      setAutocompleteResults([])
    } catch { setAutocompleteResults([]) }
  }, [empresaId, clienteId])

  function handleDescripcionChange(idx: number, value: string) {
    setAutocompleteIdx(idx)
    fetchAutocomplete(value)
    updateLinea(idx, { descripcion: value })
  }

  function selectProducto(idx: number, producto: Producto) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated: LineaLocal = {
        ...l,
        producto_id: producto.id,
        sku: producto.sku ?? null,
        descripcion: producto.nombre,
        formato: producto.formato ?? null,
        valor_neto: Number(producto.precio_venta),
        margen: Number(producto.precio_venta) > 0
          ? (Number(producto.precio_venta) - Number(producto.precio_costo ?? 0)) / Number(producto.precio_venta)
          : null,
      }
      return calcLinea(updated)
    }))
    setAutocompleteIdx(null)
    setAutocompleteResults([])
  }

  function updateLinea(idx: number, patch: Partial<LineaLocal>) {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, ...patch })))
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

  async function checkCredit(saleTotal: number, onProceed: () => void, aprobacionPayload?: AprobacionPayload) {
    if (!empresaId) { onProceed(); return }
    const empresa = empresas.find(e => e.id === empresaId)
    if (!empresa?.linea_credito) { onProceed(); return }
    try {
      const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
      const credito = res.data
      if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
        setCreditModal({
          credito,
          aprobacionPayload: isAdmin ? undefined : aprobacionPayload,
          adminOverride: isAdmin,
        })
      } else {
        onProceed()
      }
    } catch {
      onProceed()
    }
  }

  async function handleSave() {
    if (!clienteId) { setError('Selecciona un cliente'); return }
    if (!isNew) { doSave(); return }
    const lineasPayload = lineas.map((l, i) => ({
      orden: i + 1,
      producto_id: l.producto_id,
      sku: l.sku,
      descripcion: l.descripcion,
      formato: l.formato,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
    }))
    const aprobacionPayload: AprobacionPayload = {
      empresa_id: Number(empresaId),
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
    }
    checkCredit(total, doSave, aprobacionPayload)
  }

  async function doSave(): Promise<boolean> {
    setSaving(true)
    setError('')
    try {
      const payload = {
        cliente_id: clienteId,
        vendedor_id: vendedorId || currentUser?.id,
        contacto: contacto || null,
        correo: correo || null,
        fecha,
        nota: nota || null,
        empresa_id: empresaId || null,
        terminos_pago: empresaSinCredito ? 'al_contado' : null,
        retiro_en_conico: retiroEnConico,
        sede_despacho_id: retiroEnConico ? null : sedeDespachoId,
        metodo_pago: metodoPago || null,
        plazo_dias: plazoDias,
        numero_oc_cliente: numeroOcCliente.trim() || null,
      }
      const lineasPayload = lineas.map((l, i) => ({
        orden: i + 1,
        producto_id: l.producto_id,
        sku: l.sku,
        descripcion: l.descripcion,
        formato: l.formato,
        cantidad: l.cantidad,
        valor_neto: l.valor_neto,
      }))
      let nvId: number
      if (isNew) {
        const res = await api.post<NotaVenta>('/api/nota_ventas/', { ...payload, lineas: lineasPayload })
        nvId = res.data.id
      } else {
        await api.patch(`/api/nota_ventas/${id}`, payload)
        await api.put(`/api/nota_ventas/${id}/lineas`, lineasPayload)
        nvId = Number(id)
      }
      qc.invalidateQueries({ queryKey: ['nota_ventas'] })
      setSavedSnapshot(currentSnapshot)
      navigate(`/notas-venta/${nvId}`)
      return true
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al guardar')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAndContinue() {
    setModalSaving(true)
    const ok = await doSave()
    setModalSaving(false)
    if (ok) {
      setUnsavedModal(false)
      if (pendingAction === 'pdf') openPdf(`/api/nota_ventas/${id}/pdf`)
      else if (pendingAction === 'email') emailMut.mutate()
      setPendingAction(null)
    }
  }

  function handleDiscardAndContinue() {
    if (nv) {
      setClienteId(nv.cliente_id)
      setVendedorId(nv.vendedor_id ?? '')
      setContacto(nv.contacto ?? '')
      setCorreo(nv.correo ?? '')
      setFecha(nv.fecha)
      setNota(nv.nota ?? '')
      setRetiroEnConico(nv.retiro_en_conico ?? false)
      setSedeDespachoId(nv.sede_despacho_id ?? null)
      setMetodoPago(nv.metodo_pago ?? '')
      setPlazoDias(nv.plazo_dias ?? 0)
      setNumeroOcCliente(nv.numero_oc_cliente ?? '')
      setEmpresaId(nv.empresa_id ?? '')
      setLineas(
        (nv.lineas ?? []).map((l, i) => ({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
        }))
      )
      setSavedSnapshot(nvSnapshot(nv))
    }
    setUnsavedModal(false)
    if (pendingAction === 'pdf') openPdf(`/api/nota_ventas/${id}/pdf`)
    else if (pendingAction === 'email') emailMut.mutate()
    setPendingAction(null)
  }

  const estadoMut = useMutation({
    mutationFn: (nuevoEstado: string) =>
      api.patch(`/api/nota_ventas/${id}/estado`, { estado: nuevoEstado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nota_venta', id] })
      setEstadoMenuOpen(false)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al cambiar estado')
      setEstadoMenuOpen(false)
    },
  })

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/nota_ventas/${id}/email`),
    onSuccess: () => toast.success('Email enviado correctamente'),
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al enviar email'),
  })

  const genFacturaMut = useMutation({
    mutationFn: (tipo: string) => api.post(`/api/facturas/from_nv/${id}?tipo_dte=${tipo}`),
    onSuccess: (res: any) => { setGenFacturaOpen(false); navigate(`/facturas/${res.data.id}`) },
  })

  const recotizarMut = useMutation({
    mutationFn: () => api.post(`/api/nota_ventas/${id}/recotizar`).then(r => r.data),
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

  const validTransitions = !isNew && nv ? getValidTransitions(nv.estado, isAdmin) : []
  const dirtyBorder = 'border-warning-400 dark:border-warning-500'

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => navigate('/notas-venta')}
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white font-num">
            {isNew ? 'Nueva nota de venta' : `NV-${String(nv?.numero ?? '').padStart(5, '0')}`}
          </h1>
          {!isNew && nv && (
            <Badge variant={ESTADO_VARIANT[nv.estado] ?? 'neutral'} size="sm">
              {ESTADO_LABELS[nv.estado] ?? nv.estado}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && nv && validTransitions.length > 0 && (
            <Popover open={estadoMenuOpen} onOpenChange={setEstadoMenuOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">Cambiar estado</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-1 min-w-[160px]">
                {validTransitions.map(t => (
                  <button
                    key={t}
                    onClick={() => estadoMut.mutate(t)}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    → {ESTADO_LABELS[t]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {!isNew && (
            <>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<FileText />}
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                  openPdf(`/api/nota_ventas/${id}/pdf`)
                }}
                disabled={lineasErrors.length > 0}
                title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
              >
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Mail />}
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('email'); setUnsavedModal(true); return }
                  emailMut.mutate()
                }}
                disabled={emailMut.isPending || lineasErrors.length > 0}
                loading={emailMut.isPending}
                title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
              >
                Email
              </Button>
              {nv?.factura_id == null && (
                <Button
                  size="sm"
                  leftIcon={<Receipt />}
                  onClick={() => setGenFacturaOpen(true)}
                >
                  Generar Factura
                </Button>
              )}
              {nv && nv.estado !== 'cancelada' && (
                <Button
                  size="sm"
                  leftIcon={<Truck />}
                  onClick={() => navigate(`/guias-despacho/nueva?nv_id=${nv.id}`)}
                  title="Crear guía de despacho desde esta NV"
                >
                  Generar guía
                </Button>
              )}
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
              {nv?.factura_id != null && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Receipt />}
                  onClick={() => navigate(`/facturas/${nv.factura_id}`)}
                >
                  Ver Factura
                </Button>
              )}
            </>
          )}
          {!isLocked && (
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={lineasErrors.length > 0}
              title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
            >
              Guardar
            </Button>
          )}
        </div>
      </div>

      {!isNew && nv?.cotizacion_id && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Originada desde cotización:</span>
          <button
            onClick={() => navigate(`/cotizaciones/${nv.cotizacion_id}`)}
            className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline font-num"
          >
            COT-{String(nv.cotizacion?.numero ?? nv.cotizacion_id).padStart(5, '0')}
            <ExternalLink size={11} />
          </button>
        </div>
      )}

      {isLocked && (
        <div className="mb-4 rounded-lg border border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-500/10 px-4 py-3 text-sm text-warning-800 dark:text-warning-300 flex items-center gap-2">
          <Lock size={15} />
          Este documento está bloqueado — se generó una Factura desde esta nota de venta.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-600 dark:text-danger-400">
          {error}
        </div>
      )}

      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Cliente" required>
              <Select
                value={clienteId ? String(clienteId) : ''}
                onValueChange={v => handleClienteChange(v ? Number(v) : '')}
                disabled={isLocked}
              >
                <SelectTrigger className={df('clienteId', clienteId) ? dirtyBorder : ''}>
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
                onValueChange={v => { setEmpresaId(v === 'none' ? '' : Number(v)); setSedeDespachoId(null) }}
                disabled={isLocked}
              >
                <SelectTrigger className={df('empresaId', empresaId) ? dirtyBorder : ''}>
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

            <FormField label="Método de pago">
              <Select
                value={metodoPago || 'none'}
                onValueChange={v => {
                  const m = v === 'none' ? '' : v
                  setMetodoPago(m)
                  if (m && isPlazoForzadoCero(m)) setPlazoDias(0)
                }}
                disabled={isLocked || isVendedor}
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
                disabled={isLocked || isVendedor || (!!metodoPago && isPlazoForzadoCero(metodoPago))}
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
                value={contacto}
                onChange={e => setContacto(e.target.value)}
                disabled={isLocked}
                placeholder="Nombre del contacto"
                className={df('contacto', contacto) ? dirtyBorder : ''}
              />
            </FormField>

            <FormField label="Correo">
              <Input
                type="email"
                value={correo}
                onChange={e => setCorreo(e.target.value)}
                disabled={isLocked}
                placeholder="email@ejemplo.com"
                className={df('correo', correo) ? dirtyBorder : ''}
              />
            </FormField>

            <FormField label="Fecha">
              <Input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                disabled={isLocked}
                className={df('fecha', fecha) ? dirtyBorder : ''}
              />
            </FormField>

            {isAdmin && (
              <FormField label="Encargado">
                <Select
                  value={vendedorId ? String(vendedorId) : ''}
                  onValueChange={v => setVendedorId(v ? Number(v) : '')}
                  disabled={isLocked}
                >
                  <SelectTrigger className={df('vendedorId', vendedorId) ? dirtyBorder : ''}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                disabled={isLocked}
                placeholder="Notas internas o para el cliente..."
                className={df('nota', nota) ? dirtyBorder : ''}
              />
            </FormField>

            <FormField label="N° OC del cliente" className="sm:col-span-2 lg:col-span-3">
              <input
                type="text"
                value={numeroOcCliente}
                onChange={e => setNumeroOcCliente(e.target.value)}
                disabled={isLocked}
                maxLength={100}
                placeholder="Ej. OC-12345"
                className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-60 disabled:cursor-not-allowed ${df('numeroOcCliente', numeroOcCliente) ? dirtyBorder : 'border-gray-300 dark:border-gray-700'}`}
              />
            </FormField>

            <div className="sm:col-span-2 lg:col-span-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={retiroEnConico}
                  disabled={isLocked}
                  onChange={e => {
                    setRetiroEnConico(e.target.checked)
                    if (e.target.checked) setSedeDespachoId(null)
                  }}
                  className="rounded border-gray-300 accent-brand-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className={`text-sm font-medium ${df('retiroEnConico', retiroEnConico) ? 'text-warning-600 dark:text-warning-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  Retiro en Conico
                </span>
              </label>
              {!retiroEnConico && (
                <FormField label="Sede de despacho">
                  <Select
                    value={sedeDespachoId ? String(sedeDespachoId) : 'none'}
                    onValueChange={v => setSedeDespachoId(v === 'none' ? null : Number(v))}
                    disabled={isLocked}
                  >
                    <SelectTrigger className={df('sedeDespachoId', sedeDespachoId) ? dirtyBorder : ''}>
                      <SelectValue placeholder={sedes.length === 0 ? 'Sin sedes registradas' : '— Seleccionar sede —'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Seleccionar sede —</SelectItem>
                      {sedes.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.nombre} — {s.direccion}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <Table density="compact">
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
              {!isVendedor && <TH className="text-right w-20">Margen</TH>}
              <TH className="w-10" />
            </TR>
          </THead>
          <TBody>
            {lineas.map((linea, idx) => (
              <TR key={linea._key} className={lineaDirty(idx) ? 'bg-warning-50 dark:bg-warning-500/5' : ''}>
                <TD className="text-center text-gray-500 dark:text-gray-400 font-num">{idx + 1}</TD>
                <TD>
                  <Input
                    size="sm"
                    value={linea.sku ?? ''}
                    onChange={e => updateLinea(idx, { sku: e.target.value || null })}
                    disabled={isLocked || !!linea.producto_id}
                    placeholder="SKU"
                  />
                </TD>
                <TD className="relative">
                  <Input
                    size="sm"
                    value={linea.descripcion}
                    onChange={e => handleDescripcionChange(idx, e.target.value)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 200)}
                    disabled={isLocked || !!linea.producto_id}
                    placeholder="Descripción..."
                  />
                  {autocompleteIdx === idx && autocompleteResults.length > 0 && (
                    <div className="absolute z-20 left-3 right-3 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-elev-3 overflow-hidden">
                      {autocompleteResults.slice(0, 8).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => selectProducto(idx, p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 dark:hover:bg-brand-500/10 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                          <div className="text-gray-500 dark:text-gray-400 font-num">
                            {p.sku ? `SKU: ${p.sku}` : ''}{p.formato ? ` · ${p.formato}` : ''} · $ {p.precio_venta.toLocaleString('es-CL')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </TD>
                <TD>
                  <Input
                    size="sm"
                    value={linea.formato ?? ''}
                    onChange={e => updateLinea(idx, { formato: e.target.value || null })}
                    disabled={isLocked || !!linea.producto_id}
                    placeholder="Formato"
                  />
                </TD>
                <TD>
                  <Input
                    size="sm"
                    type="number"
                    min="1"
                    className="text-right"
                    value={linea.cantidad}
                    onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                    disabled={isLocked}
                  />
                </TD>
                <TD>
                  <Input
                    size="sm"
                    type="number"
                    min="0"
                    className="text-right"
                    value={linea.valor_neto}
                    onChange={e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 })}
                    disabled={isLocked}
                  />
                </TD>
                <TD className="text-right text-gray-700 dark:text-gray-300 font-num font-medium">{fmtMoney(linea.total_neto)}</TD>
                <TD className="text-right text-gray-500 dark:text-gray-400 font-num">{fmtMoney(linea.iva)}</TD>
                <TD className="text-right text-gray-900 dark:text-white font-num font-medium">{fmtMoney(linea.total)}</TD>
                {!isVendedor && (
                  <TD className="text-right font-num">
                    {linea.margen !== null
                      ? <span className={linea.margen >= 0.15 ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'}>{(linea.margen * 100).toFixed(1)}%</span>
                      : <span className="text-gray-400">—</span>}
                  </TD>
                )}
                <TD>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeLinea(idx)}
                    disabled={lineas.length === 1 || isLocked}
                    aria-label="Eliminar línea"
                    className="text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                  >
                    <Trash2 size={14} />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        {!isLocked ? (
          <Button variant="ghost" size="sm" leftIcon={<Plus />} onClick={addLinea}>
            Agregar línea
          </Button>
        ) : <div />}
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

      {!isNew && nv && (
        <div className="mt-5">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Adjuntos (OC u otros)</h2>
            </CardHeader>
            <CardContent>
              <NotaVentaAdjuntos nvId={nv.id} disabled={isLocked} />
            </CardContent>
          </Card>
        </div>
      )}

      {!isNew && nv && (
        <div className="mt-5">
          <TareasRelacionadas tipo="nota_venta" id={nv.id} />
        </div>
      )}

      {creditModal && (
        <CreditWarningModal
          mode={creditModal.adminOverride ? 'warning' : 'request'}
          empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
          credito={creditModal.credito}
          saleTotal={total}
          onConfirm={creditModal.adminOverride ? () => { setCreditModal(null); doSave() } : undefined}
          aprobacionPayload={creditModal.aprobacionPayload}
          onSubmitted={() => setCreditModal(null)}
          onCancel={() => setCreditModal(null)}
        />
      )}

      <UnsavedChangesModal
        open={unsavedModal}
        saving={modalSaving}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscardAndContinue={handleDiscardAndContinue}
        onCancel={() => { setUnsavedModal(false); setPendingAction(null) }}
        docType="nv"
      />

      <Modal open={genFacturaOpen} onOpenChange={setGenFacturaOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Generar Factura</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">Selecciona el tipo de factura a emitir.</p>
              <Select value={tipoDteFactura} onValueChange={(v) => setTipoDteFactura(v as '033' | '034')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="033">Factura afecta (tipo 33)</SelectItem>
                  <SelectItem value="034">Factura exenta (tipo 34)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" size="sm" onClick={() => setGenFacturaOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              loading={genFacturaMut.isPending}
              onClick={() => genFacturaMut.mutate(tipoDteFactura)}
            >
              Generar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
