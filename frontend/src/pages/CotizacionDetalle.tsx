import { openPdf } from '../lib/pdf'
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, Mail, ArrowLeft, Building2, Phone, RotateCcw, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Cotizacion, CotizacionLinea, Cliente, User, Producto, Empresa, NotaVenta } from '../types'
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
import UnsavedChangesModal from '../components/UnsavedChangesModal'

type LineaLocal = Omit<CotizacionLinea, 'id'> & { id?: number; _key: string; _stock?: number | null; _costo?: number | null }

const ESTADOS = [
  { value: 'no_definido', label: 'Sin definir' },
  { value: 'abierta', label: 'Abierta' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'cerrada_fv', label: 'Cerrada (FV)' },
  { value: 'rechazada', label: 'Rechazada' },
]

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

function parseDias(plazo: string | null | undefined): number {
  if (!plazo) return 0
  const lower = plazo.toLowerCase()
  if (lower.includes('contado')) return 0
  const m = lower.match(/(\d+)/)
  return m ? parseInt(m[1]) : 0
}

function getLineasErrors(lineas: LineaLocal[]): string[] {
  const errors: string[] = []
  if (lineas.some(l => l.producto_id === null || l.producto_id === undefined))
    errors.push('Hay líneas sin producto seleccionado')
  if (lineas.some(l => l.margen !== null && l.margen !== undefined && Number(l.margen) < 0))
    errors.push('Hay líneas con margen negativo')
  return errors
}

function cotizacionSnapshot(cot: Cotizacion): string {
  return JSON.stringify({
    clienteId: cot.cliente_id,
    vendedorId: cot.vendedor_id ?? '',
    contacto: cot.contacto ?? '',
    correo: cot.correo ?? '',
    fecha: cot.fecha,
    estado: cot.estado,
    nota: cot.nota ?? '',
    empresaId: cot.empresa_id ?? '',
    terminosPago: cot.terminos_pago ?? '',
    lineas: (cot.lineas ?? []).map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  })
}

export default function CotizacionDetalle() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id || id === 'nueva'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'

  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>(currentUser?.id ?? '')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [estado, setEstado] = useState('no_definido')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaLocal[]>([newLinea(1)])
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null)
  const [marginOverrideIdx, setMarginOverrideIdx] = useState<number | null>(null)
  const [marginOverrideInput, setMarginOverrideInput] = useState('')
  const [propuestas, setPropuestas] = useState<Record<number, { margenPropuesto: number; valorNetoPropuesto: number }>>({})
  const [solicitudMargenModal, setSolicitudMargenModal] = useState(false)
  const [notaSolicitud, setNotaSolicitud] = useState('')
  const [solicitudMargenError, setSolicitudMargenError] = useState('')
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)
  const [focusedPrecioIdx, setFocusedPrecioIdx] = useState<number | null>(null)
  const [creditModal, setCreditModal] = useState<{
    mode: 'warning' | 'request'
    credito: CreditoInfo
    onConfirm?: () => void
    aprobacionPayload?: AprobacionPayload
  } | null>(null)

  const [marginStatus, setMarginStatus] = useState<{
    blocked: boolean
    estado: 'pendiente' | 'aprobada' | 'denegada' | 'revocada' | null
    aprobacion_id: number | null
  } | null>(null)

  const [revokeDialog, setRevokeDialog] = useState<{ pendingChange: () => void } | null>(null)

  const [unsavedModal, setUnsavedModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [terminosPago, setTerminosPago] = useState('')
  const [terminosPagoEstado, setTerminosPagoEstado] = useState('aprobado')

  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId,
    terminosPago,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId, terminosPago, lineas])

  const isDirty = !isNew && savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const { data: cotizacion } = useQuery<Cotizacion>({
    queryKey: ['cotizacion', id],
    queryFn: () => api.get(`/api/cotizaciones/${id}`).then(r => r.data),
    enabled: !isNew,
  })

  const { data: aprobacionCredito, refetch: refetchAprobacionCredito } = useQuery<{
    id: number; estado: string; nv_id: number | null
  } | null>({
    queryKey: ['aprobacion-credito', id],
    queryFn: () =>
      api.get(`/api/aprobaciones/?cotizacion_id=${id}`).then(r => r.data[0] ?? null),
    enabled: !isNew,
  })

  const { data: aprobacionMargen, refetch: refetchAprobacionMargen } = useQuery<{
    id: number; estado: string; lineas_propuestas: unknown[]
  } | null>({
    queryKey: ['aprobacion-margen', id],
    queryFn: () =>
      api.get(`/api/aprobaciones_margen/?cotizacion_id=${id}`).then(r => r.data[0] ?? null),
    enabled: !isNew,
  })

  useEffect(() => {
    if (isNew || isAdmin) return
    api.get(`/api/cotizaciones/${id}/margin-status`)
      .then(r => setMarginStatus(r.data))
      .catch(() => {})
  }, [id, isNew, isAdmin])

  useEffect(() => {
    if (cotizacion) {
      setClienteId(cotizacion.cliente_id)
      setVendedorId(cotizacion.vendedor_id)
      setContacto(cotizacion.contacto ?? '')
      setCorreo(cotizacion.correo ?? '')
      setFecha(cotizacion.fecha)
      setEstado(cotizacion.estado)
      setNota(cotizacion.nota ?? '')
      setEmpresaId(cotizacion.empresa_id ?? '')
      setTerminosPago(cotizacion.terminos_pago ?? '')
      setTerminosPagoEstado(cotizacion.terminos_pago_estado ?? 'aprobado')
      setLineas(
        (cotizacion.lineas ?? []).map((l, i) => calcLinea({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
          _costo: (l.margen != null && Number(l.valor_neto) > 0) ? Number(l.valor_neto) * (1 - l.margen) : null,
        }))
      )
      setPropuestas({})
      setSavedSnapshot(cotizacionSnapshot(cotizacion))
    }
  }, [cotizacion])

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
  const empresaPlazo = selectedEmpresa?.plazo_credito ?? 'Al contado'
  const empresaLimitDias = parseDias(selectedEmpresa?.plazo_credito)
  const terminosPagoNeedsApproval = !isAdmin
    && !!terminosPago
    && parseDias(terminosPago) > empresaLimitDias
  const adminTerminosWarning = isAdmin
    && !!terminosPago
    && parseDias(terminosPago) > empresaLimitDias
  const tpBlocked = !isAdmin && (terminosPagoNeedsApproval || terminosPagoEstado === 'pendiente')

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos'],
    queryFn: () => api.get('/api/productos/').then(r => r.data),
  })

  function handleClienteChange(cid: number | '') {
    withRevokeGuard(() => {
      setClienteId(cid)
      if (cid) {
        const c = clientes.find(cl => cl.id === cid)
        if (c) {
          setContacto(c.nombre)
          setCorreo(c.email ?? '')
          if (c.empresa_id) {
            setEmpresaId(c.empresa_id)
            const emp = empresas.find(e => e.id === c.empresa_id)
            setTerminosPago(emp?.plazo_credito ?? 'Al contado')
          }
        }
      }
    })
  }

  function handleEmpresaChange(eid: number | '') {
    withRevokeGuard(() => {
      setEmpresaId(eid)
      if (eid) {
        const emp = empresas.find(e => e.id === eid)
        setTerminosPago(emp?.plazo_credito ?? 'Al contado')
      }
    })
  }

  const selectedCliente = clientes.find(c => c.id === clienteId) ?? null

  function filterProductos(q: string): Producto[] {
    const lower = q.toLowerCase()
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(lower) ||
      (p.sku ?? '').toLowerCase().includes(lower) ||
      (p.formato ?? '').toLowerCase().includes(lower)
    ).slice(0, 10)
  }

  function handleDescripcionChange(idx: number, value: string, e: React.ChangeEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.bottom + 280 > window.innerHeight
    setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
    setAutocompleteIdx(idx)
    setAutocompleteResults(filterProductos(value))
    updateLinea(idx, { descripcion: value })
  }

  function handleDescripcionFocus(idx: number, value: string, e: React.FocusEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.bottom + 280 > window.innerHeight
    setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
    setAutocompleteIdx(idx)
    setAutocompleteResults(filterProductos(value))
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
        valor_neto: producto.precio_venta,
        margen: producto.precio_venta > 0
          ? (producto.precio_venta - producto.precio_costo) / producto.precio_venta
          : null,
        _costo: producto.precio_costo ?? null,
        _stock: producto.stock_actual,
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

  function withRevokeGuard(change: () => void) {
    if (!isAdmin && marginStatus?.estado === 'aprobada') {
      setRevokeDialog({ pendingChange: change })
    } else {
      change()
    }
  }

  async function confirmRevoke() {
    if (!revokeDialog || !marginStatus?.aprobacion_id) return
    revokeDialog.pendingChange()
    setRevokeDialog(null)
    setMarginStatus(prev => prev ? { ...prev, blocked: true, estado: 'revocada' } : prev)
    try {
      await api.patch(`/api/aprobaciones_margen/${marginStatus.aprobacion_id}`, { accion: 'revocar' })
    } catch {
    }
  }

  function handleMargenChange(idx: number, pctStr: string) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const pct = parseFloat(pctStr)
      const newMargen = isNaN(pct) ? null : pct / 100
      const updates: Partial<LineaLocal> = { margen: newMargen }
      const costo = l._costo != null
        ? l._costo
        : (l.margen != null && Number(l.margen) < 1 && Number(l.valor_neto) > 0
            ? Number(l.valor_neto) * (1 - Number(l.margen))
            : null)
      if (newMargen !== null && newMargen < 1 && costo != null && costo > 0)
        updates.valor_neto = Math.round(costo / (1 - newMargen))
      return calcLinea({ ...l, ...updates })
    }))
  }

  function handleValorNetoChange(idx: number, val: string) {
    withRevokeGuard(() => setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const vn = Math.max(0, parseFloat(val) || 0)
      const newMargen = l._costo != null && vn > 0 ? (vn - l._costo) / vn : l.margen
      return calcLinea({ ...l, valor_neto: vn, margen: newMargen })
    })))
  }

  function handleResetPrecio(idx: number) {
    const linea = lineas[idx]
    if (!linea.producto_id) return
    const prod = productos.find(p => p.id === linea.producto_id)
    if (!prod) return
    const vn = prod.precio_venta
    const costo = prod.precio_costo ?? null
    const newMargen = vn > 0 && costo != null ? (vn - costo) / vn : linea.margen
    setLineas(prev => prev.map((l, i) => i !== idx ? l : calcLinea({ ...l, valor_neto: vn, margen: newMargen, _costo: costo })))
  }

  function handleMargenPropuesta(lineaId: number, pctStr: string) {
    const linea = lineas.find(l => l.id === lineaId)
    if (!linea) return
    const pct = parseFloat(pctStr)
    if (isNaN(pct)) {
      setPropuestas(prev => { const next = { ...prev }; delete next[lineaId]; return next })
      return
    }
    const newMargen = pct / 100
    if (newMargen >= 1 || newMargen < 0) return
    const costo = linea._costo != null
      ? linea._costo
      : (linea.margen != null && Number(linea.margen) < 1 && Number(linea.valor_neto) > 0
          ? Number(linea.valor_neto) * (1 - Number(linea.margen))
          : null)
    if (costo == null || costo <= 0) return
    const valorNetoPropuesto = Math.round(costo / (1 - newMargen))
    setPropuestas(prev => ({ ...prev, [lineaId]: { margenPropuesto: newMargen, valorNetoPropuesto } }))
  }

  async function handleEnviarSolicitudMargen() {
    if (!id || Object.keys(propuestas).length === 0) return
    setEnviandoSolicitud(true)
    setSolicitudMargenError('')
    try {
      const lineasPropuestas = lineas
        .filter(l => l.id != null && propuestas[l.id!] != null)
        .map(l => ({
          linea_id: l.id!,
          descripcion: l.descripcion,
          valor_neto_actual: Number(l.valor_neto),
          margen_actual: l.margen != null ? Number(l.margen) : null,
          valor_neto_propuesto: propuestas[l.id!].valorNetoPropuesto,
          margen_propuesto: propuestas[l.id!].margenPropuesto,
        }))
      await api.post('/api/aprobaciones_margen/', {
        cotizacion_id: Number(id),
        nota: notaSolicitud || null,
        lineas_propuestas: lineasPropuestas,
      })
      setSolicitudMargenModal(false)
      setNotaSolicitud('')
      setPropuestas({})
      refetchAprobacionMargen()
    } catch (err: any) {
      setSolicitudMargenError(err?.response?.data?.detail || 'Error al enviar solicitud')
    } finally {
      setEnviandoSolicitud(false)
    }
  }

  const totalNeto = lineas.reduce((s, l) => s + (Number(l.total_neto) || 0), 0)
  const totalIva = lineas.reduce((s, l) => s + (Number(l.iva) || 0), 0)
  const total = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0)

  async function checkCredit(saleTotal: number, mode: 'warning' | 'request', onProceed: (() => void) | null, aprobacionPayload?: AprobacionPayload) {
    if (!empresaId) { onProceed?.(); return }
    const empresa = empresas.find(e => e.id === empresaId)
    if (!empresa?.limite_credito) { onProceed?.(); return }
    try {
      const res = await api.get<CreditoInfo>(`/api/empresas/${empresaId}/credito`)
      const credito = res.data
      if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
        if (mode === 'warning') {
          setCreditModal({
            mode: 'warning',
            credito,
            onConfirm: () => { setCreditModal(null); onProceed!() },
          })
        } else {
          setCreditModal({
            mode: 'request',
            credito,
            aprobacionPayload,
          })
        }
      } else {
        onProceed?.()
      }
    } catch {
      onProceed?.()
    }
  }

  async function handleSave() {
    if (!clienteId) { setError('Selecciona un cliente'); return }
    checkCredit(total, 'warning', doSave)
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
        estado,
        nota: nota || null,
        empresa_id: empresaId || null,
        terminos_pago: terminosPago || null,
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

      let cotId: number
      if (isNew) {
        const res = await api.post<Cotizacion>('/api/cotizaciones/', { ...payload, lineas: lineasPayload })
        cotId = res.data.id
      } else {
        await api.patch(`/api/cotizaciones/${id}`, payload)
        await api.put(`/api/cotizaciones/${id}/lineas`, lineasPayload)
        cotId = Number(id)
      }
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      setSavedSnapshot(currentSnapshot)
      navigate(`/cotizaciones/${cotId}`)
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
      if (pendingAction === 'pdf') openPdf(`/api/cotizaciones/${id}/pdf`)
      else if (pendingAction === 'email') emailMut.mutate()
      setPendingAction(null)
    }
  }

  function handleDiscardAndContinue() {
    if (cotizacion) {
      setClienteId(cotizacion.cliente_id)
      setVendedorId(cotizacion.vendedor_id ?? '')
      setContacto(cotizacion.contacto ?? '')
      setCorreo(cotizacion.correo ?? '')
      setFecha(cotizacion.fecha)
      setEstado(cotizacion.estado)
      setNota(cotizacion.nota ?? '')
      setEmpresaId(cotizacion.empresa_id ?? '')
      setTerminosPago(cotizacion.terminos_pago ?? '')
      setTerminosPagoEstado(cotizacion.terminos_pago_estado ?? 'aprobado')
      setLineas(
        (cotizacion.lineas ?? []).map((l, i) => calcLinea({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          margen: l.margen ?? null,
          _costo: (l.margen != null && Number(l.valor_neto) > 0) ? Number(l.valor_neto) * (1 - l.margen) : null,
        }))
      )
      setSavedSnapshot(cotizacionSnapshot(cotizacion))
    }
    setUnsavedModal(false)
    if (pendingAction === 'pdf') openPdf(`/api/cotizaciones/${id}/pdf`)
    else if (pendingAction === 'email') emailMut.mutate()
    setPendingAction(null)
  }

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/cotizaciones/${id}/email`),
    onSuccess: () => {
      setEmailToast({ msg: 'Email enviado correctamente', ok: true })
      setTimeout(() => setEmailToast(null), 3500)
    },
    onError: (err: any) => {
      setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false })
      setTimeout(() => setEmailToast(null), 4000)
    },
  })

  const crearNvMut = useMutation({
    mutationFn: () => api.post<NotaVenta>(`/api/nota_ventas/from_cotizacion/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cotizacion', id] })
      navigate(`/notas-venta/${res.data.id}`)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al crear nota de venta')
    },
  })

  const approveTerminosPagoMut = useMutation({
    mutationFn: (estado: 'aprobado' | 'rechazado') =>
      api.patch(`/api/cotizaciones/${id}`, { terminos_pago_estado: estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizacion', id] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al actualizar términos de pago')
    },
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/cotizaciones')} className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva cotización' : `COT-${String(cotizacion?.numero ?? '').padStart(5, '0')}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <button
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                  openPdf(`/api/cotizaciones/${id}/pdf`)
                }}
                disabled={(!isAdmin && !!marginStatus?.blocked) || tpBlocked || lineasErrors.length > 0}
                title={
                  lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobación de márgenes'
                  : tpBlocked ? 'Requiere aprobación de términos de pago'
                  : undefined
                }
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText size={15} />
                PDF
              </button>
              <button
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('email'); setUnsavedModal(true); return }
                  emailMut.mutate()
                }}
                disabled={emailMut.isPending || (!isAdmin && !!marginStatus?.blocked) || tpBlocked || lineasErrors.length > 0}
                title={
                  lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobación de márgenes'
                  : tpBlocked ? 'Requiere aprobación de términos de pago'
                  : undefined
                }
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail size={15} />
                {emailMut.isPending ? 'Enviando...' : 'Email'}
              </button>
              <button
                onClick={() => checkCredit(total, 'request', () => crearNvMut.mutate(), { empresa_id: Number(empresaId), total, origen: 'cotizacion', cotizacion_id: Number(id) })}
                disabled={crearNvMut.isPending || lineasErrors.length > 0 || isDirty || cotizacion?.estado === 'cerrada_fv'}
                title={
                  cotizacion?.estado === 'cerrada_fv' ? 'Ya existe una nota de venta para esta cotización'
                  : lineasErrors.length > 0 ? lineasErrors.join(' | ')
                  : isDirty ? 'Guarda los cambios antes de crear la NV'
                  : undefined
                }
                className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {crearNvMut.isPending ? 'Creando...' : 'Crear NV'}
              </button>
            </>
          )}
          {!isAdmin && !isNew && Object.keys(propuestas).length > 0 && (
            <button
              type="button"
              onClick={() => setSolicitudMargenModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors"
            >
              Solicitar ajuste de márgenes
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || lineasErrors.length > 0}
            title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {!isNew && aprobacionCredito && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 ${
          aprobacionCredito.estado === 'pendiente'
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
            : aprobacionCredito.estado === 'aprobada'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          <span>
            {aprobacionCredito.estado === 'pendiente' && 'Solicitud de crédito enviada — pendiente de aprobación'}
            {aprobacionCredito.estado === 'aprobada' && 'Solicitud de crédito aprobada'}
            {aprobacionCredito.estado === 'denegada' && 'Solicitud de crédito denegada'}
          </span>
          {aprobacionCredito.estado === 'aprobada' && aprobacionCredito.nv_id && (
            <button
              onClick={() => navigate(`/notas-venta/${aprobacionCredito.nv_id}`)}
              className="text-xs font-medium underline whitespace-nowrap"
            >
              Ver nota de venta →
            </button>
          )}
        </div>
      )}

      {!isNew && aprobacionMargen && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          aprobacionMargen.estado === 'pendiente'
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
            : aprobacionMargen.estado === 'aprobada'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {aprobacionMargen.estado === 'pendiente' && 'Solicitud de ajuste de márgenes enviada — pendiente de aprobación'}
          {aprobacionMargen.estado === 'aprobada' && 'Solicitud aprobada — los precios han sido actualizados'}
          {aprobacionMargen.estado === 'denegada' && 'Solicitud de ajuste de márgenes denegada'}
        </div>
      )}

      {!isAdmin && marginStatus?.blocked && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${
          marginStatus.estado === 'pendiente'
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {marginStatus.estado === 'pendiente'
            ? 'Precios modificados — solicitud de aprobacion pendiente. PDF y email deshabilitados.'
            : 'Precios modificados requieren aprobacion antes de generar PDF o enviar email.'}
        </div>
      )}

      {!isAdmin && !isNew && tpBlocked && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
          {terminosPagoEstado === 'pendiente'
            ? 'Términos de pago extendidos — pendiente de aprobación. PDF y email deshabilitados.'
            : 'Los términos de pago requieren aprobación antes de generar PDF o enviar email.'}
        </div>
      )}
      {!isAdmin && !isNew && terminosPagoEstado === 'rechazado' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
          Términos de pago rechazados por el administrador. Actualiza los términos y guarda.
        </div>
      )}
      {isAdmin && !isNew && cotizacion?.terminos_pago_estado === 'pendiente' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-between gap-3">
          <span>Términos de pago extendidos requieren aprobación: <strong>{cotizacion.terminos_pago}</strong></span>
          <div className="flex gap-2">
            <button
              onClick={() => approveTerminosPagoMut.mutate('aprobado')}
              disabled={approveTerminosPagoMut.isPending}
              className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              Aprobar
            </button>
            <button
              onClick={() => approveTerminosPagoMut.mutate('rechazado')}
              disabled={approveTerminosPagoMut.isPending}
              className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente *</label>
            <select
              value={clienteId}
              onChange={e => handleClienteChange(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={e => handleEmpresaChange(e.target.value ? Number(e.target.value) : '')}
                  disabled={!!clienteId}
                  className={`w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${clienteId ? 'bg-gray-50 dark:bg-gray-800/50 cursor-default' : 'bg-white dark:bg-gray-800'}`}
                >
                  <option value="">— Sin empresa —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
          {selectedCliente && (
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
                {selectedCliente.empresa && (
                  <span className="flex items-center gap-1.5"><Building2 size={12} className="text-gray-400" />{selectedCliente.empresa.nombre}</span>
                )}
                <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200">{selectedCliente.nombre}</span>
                {selectedCliente.telefono && (
                  <span className="flex items-center gap-1.5"><Phone size={12} className="text-gray-400" />{selectedCliente.telefono}</span>
                )}
                {selectedCliente.email && (
                  <span className="flex items-center gap-1.5"><Mail size={12} className="text-gray-400" />{selectedCliente.email}</span>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/clientes')}
                  className="ml-auto flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400"
                  title="Editar cliente"
                >
                  <ExternalLink size={11} /> Editar cliente
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Encargado</label>
              <select value={vendedorId} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nota / Observaciones</label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Notas internas o para el cliente..." />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Términos de Pago
              {terminosPagoNeedsApproval && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium">
                  Requiere aprobación
                </span>
              )}
            </label>
            <select
              value={terminosPago}
              onChange={e => setTerminosPago(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccionar —</option>
              <option value="Al contado">Al contado</option>
              <option value="30 Días">30 Días</option>
              <option value="60 Días">60 Días</option>
              <option value="90 Días">90 Días</option>
              <option value="120 Días">120 Días</option>
            </select>
            {adminTerminosWarning && (
              <p className="mt-1 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Plazo supera el límite de la empresa ({empresaPlazo})
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-3 font-medium text-center w-8">#</th>
              <th className="px-3 py-3 font-medium">Producto</th>
              <th className="px-3 py-3 font-medium text-right w-20">Cant.</th>
              <th className="px-3 py-3 font-medium text-right w-32">Precio Unit.</th>
              <th className="px-3 py-3 font-medium text-right w-32">Total Neto</th>
              <th className="px-3 py-3 font-medium text-right w-20">Margen</th>
              <th className="px-3 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lineas.map((linea, idx) => (
              <tr key={linea._key} className="align-top">
                <td className="px-3 py-3 text-center text-gray-400 text-xs">{idx + 1}</td>
                <td className="px-3 py-2 relative">
                  <input type="text" value={linea.descripcion}
                    onChange={e => handleDescripcionChange(idx, e.target.value, e)}
                    onFocus={e => handleDescripcionFocus(idx, linea.descripcion, e)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 150)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Buscar en catálogo..." />
                  {linea.producto_id && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-400 dark:text-gray-500 px-1">
                      {linea.sku && <span>SKU: {linea.sku}</span>}
                      {linea.formato && <span>{linea.formato}</span>}
                      {linea._stock != null && (
                        <span className={linea.cantidad > linea._stock ? 'text-orange-500' : ''}>
                          Stock: {linea._stock}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="1" value={linea.cantidad}
                    onChange={e => withRevokeGuard(() => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className={`w-full px-2 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right ${linea._stock != null && linea.cantidad > linea._stock ? 'border-orange-400 dark:border-orange-500' : 'border-gray-200 dark:border-gray-700'}`} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {linea.producto_id && (
                      <button type="button" onClick={() => handleResetPrecio(idx)}
                        className="p-0.5 text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                        title="Restablecer precio">
                        <RotateCcw size={10} />
                      </button>
                    )}
                    {isAdmin ? (
                      <input type="text" inputMode="numeric" min="0"
                        value={focusedPrecioIdx === idx ? String(linea.valor_neto) : Math.round(Number(linea.valor_neto) || 0).toLocaleString('es-CL')}
                        onFocus={() => setFocusedPrecioIdx(idx)}
                        onBlur={() => setFocusedPrecioIdx(null)}
                        onChange={e => handleValorNetoChange(idx, e.target.value)}
                        className="w-28 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right" />
                    ) : (
                      <div className="text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {fmtMoney(linea.valor_neto)}
                        </span>
                        {linea.id != null && propuestas[linea.id] != null && (
                          <div className="text-xs text-blue-600 dark:text-blue-400">
                            → {fmtMoney(propuestas[linea.id].valorNetoPropuesto)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300 text-sm font-medium">{fmtMoney(linea.total_neto)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    {isAdmin ? (
                      <input
                        type="number" step="0.1"
                        value={linea.margen !== null ? linea.margen * 100 : ''}
                        onChange={e => handleMargenChange(idx, e.target.value)}
                        placeholder="—"
                        className={`w-16 px-1.5 py-1.5 text-xs border rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'border-orange-400 dark:border-orange-500 text-orange-500' : 'border-gray-200 dark:border-gray-700 text-green-600 dark:text-green-400'}`}
                      />
                    ) : linea.id != null ? (
                      <input
                        type="number" step="0.1"
                        value={linea.id != null && propuestas[linea.id] != null
                          ? (propuestas[linea.id].margenPropuesto * 100).toFixed(1)
                          : (linea.margen !== null ? (Number(linea.margen) * 100).toFixed(1) : '')}
                        onChange={e => linea.id != null && handleMargenPropuesta(linea.id, e.target.value)}
                        placeholder="—"
                        className={`w-16 px-1.5 py-1.5 text-xs border-2 border-dashed rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-800 ${
                          linea.id != null && propuestas[linea.id] != null
                            ? 'border-blue-400 text-blue-600 dark:text-blue-400'
                            : linea.margen !== null && Number(linea.margen) < 0.15
                            ? 'border-orange-300 text-orange-500'
                            : 'border-gray-300 dark:border-gray-600 text-green-600 dark:text-green-400'
                        }`}
                        title="Proponer cambio de margen"
                      />
                    ) : (
                      <span className={`text-xs ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}`}>
                        {linea.margen !== null ? `${(Number(linea.margen) * 100).toFixed(1)}` : '—'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeLinea(idx)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" disabled={lineas.length === 1}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between">
        <button onClick={addLinea} className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
          <Plus size={15} />
          Agregar línea
        </button>
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

      {emailToast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}

      {revokeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              Revocar aprobacion de margenes
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              Esta cotizacion tiene aprobacion de margenes vigente. Modificarla revocara la aprobacion y bloqueara el PDF y email. Continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevokeDialog(null)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRevoke}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {creditModal && (
        <CreditWarningModal
          mode={creditModal.mode}
          empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
          credito={creditModal.credito}
          saleTotal={total}
          onConfirm={creditModal.onConfirm}
          aprobacionPayload={creditModal.aprobacionPayload}
          onSubmitted={() => { setCreditModal(null); refetchAprobacionCredito() }}
          onCancel={() => setCreditModal(null)}
        />
      )}

      {solicitudMargenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Solicitar ajuste de márgenes
            </h2>
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 text-left font-medium">Producto</th>
                  <th className="pb-2 text-right font-medium">Precio actual</th>
                  <th className="pb-2 text-right font-medium">Precio propuesto</th>
                  <th className="pb-2 text-right font-medium">Margen prop.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {lineas
                  .filter(l => l.id != null && propuestas[l.id!] != null)
                  .map(l => (
                    <tr key={l._key}>
                      <td className="py-2 text-gray-900 dark:text-white truncate max-w-[180px]">{l.descripcion}</td>
                      <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmtMoney(l.valor_neto)}</td>
                      <td className="py-2 text-right text-blue-600 dark:text-blue-400 font-medium">
                        {fmtMoney(propuestas[l.id!].valorNetoPropuesto)}
                      </td>
                      <td className="py-2 text-right text-blue-600 dark:text-blue-400 font-medium">
                        {(propuestas[l.id!].margenPropuesto * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <textarea
              placeholder="Nota para el administrador (opcional)..."
              value={notaSolicitud}
              onChange={e => setNotaSolicitud(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            />
            {solicitudMargenError && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-2">{solicitudMargenError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setSolicitudMargenModal(false); setSolicitudMargenError(''); setNotaSolicitud('') }}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarSolicitudMargen}
                disabled={enviandoSolicitud}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {enviandoSolicitud ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UnsavedChangesModal
        open={unsavedModal}
        saving={modalSaving}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscardAndContinue={handleDiscardAndContinue}
        onCancel={() => { setUnsavedModal(false); setPendingAction(null) }}
        docType="cotizacion"
      />

      {autocompleteIdx !== null && autocompleteResults.length > 0 && dropdownRect && createPortal(
        <div
          style={{
            position: 'fixed',
            left: dropdownRect.left,
            width: dropdownRect.width,
            ...(dropdownRect.above
              ? { bottom: window.innerHeight - dropdownRect.top + 4 }
              : { top: dropdownRect.top + 4 }),
            zIndex: 9999,
          }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto"
        >
          {autocompleteResults.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { selectProducto(autocompleteIdx, p); setAutocompleteIdx(null); setAutocompleteResults([]) }}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{p.nombre}</div>
              <div className="flex gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {p.sku && <span>SKU: {p.sku}</span>}
                {p.formato && <span>{p.formato}</span>}
                <span className="ml-auto font-medium text-gray-700 dark:text-gray-300">{fmtMoney(p.precio_venta)}</span>
                <span className={p.stock_actual > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>Stock: {p.stock_actual}</span>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
