import { openPdf } from '../lib/pdf'
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, FileText, Mail, ArrowLeft, Building2, Phone, RotateCcw, ExternalLink, UserPlus, Lock, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Cotizacion, CotizacionLinea, Cliente, User, Producto, Empresa, NotaVenta } from '../types'
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
import UnsavedChangesModal from '../components/UnsavedChangesModal'
import ClienteSelectModal from '../components/ClienteSelectModal'
import TareasRelacionadas from '../components/TareasRelacionadas'
import {
  Button, Input, Textarea, FormField, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
  Table, THead, TBody, TR, TH, TD,
  Tooltip,
} from '../components/ui'

type LineaLocal = Omit<CotizacionLinea, 'id'> & { id?: number; _key: string; _stock?: number | null; _costo?: number | null; descuento: number }

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
    descuento: 0,
    total_neto: 0,
    iva: 0,
    total: 0,
    margen: null,
  }
}

function calcLinea(l: LineaLocal): LineaLocal {
  const cantidad = Number(l.cantidad) || 0
  const valor_neto = Number(l.valor_neto) || 0
  const descuento = Math.min(100, Math.max(0, Number(l.descuento) || 0))
  const total_neto = Math.round(cantidad * valor_neto * (1 - descuento / 100))
  const iva = Math.round(total_neto * 0.19)
  const total = total_neto + iva
  return { ...l, cantidad, valor_neto, descuento, total_neto, iva, total }
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
    validezDias: cot.validez_dias ?? 5,
    lineas: (cot.lineas ?? []).map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descuento: l.descuento ?? 0,
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

  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null)
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
  const [revoking, setRevoking] = useState(false)

  const [unsavedModal, setUnsavedModal] = useState(false)
  const [clienteModalOpen, setClienteModalOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [terminosPago, setTerminosPago] = useState('')
  const [terminosPagoEstado, setTerminosPagoEstado] = useState('aprobado')
  const [validezDias, setValidezDias] = useState<number>(5)

  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId,
    terminosPago, validezDias,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descuento: l.descuento ?? 0,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, estado, nota, empresaId, terminosPago, validezDias, lineas])

  const isDirty = !isNew && savedSnapshot !== null && currentSnapshot !== savedSnapshot

  const savedParsed = useMemo(() => (savedSnapshot && !isNew) ? JSON.parse(savedSnapshot) : null, [savedSnapshot, isNew])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const df = (field: string, val: any) => savedParsed !== null && savedParsed[field] !== val
  const lineaDirty = (idx: number) => {
    if (!savedParsed) return false
    const saved = (savedParsed.lineas ?? []) as Array<{ producto_id: number | null; cantidad: number; valor_neto: number; descripcion: string; sku: string | null; formato: string | null; descuento: number }>
    if (idx >= saved.length) return true
    const s = saved[idx], c = lineas[idx]
    return s.producto_id !== (c.producto_id ?? null) || s.cantidad !== c.cantidad ||
      s.valor_neto !== c.valor_neto || s.descripcion !== (c.descripcion ?? '') ||
      s.sku !== (c.sku ?? null) || s.formato !== (c.formato ?? null) ||
      s.descuento !== (c.descuento ?? 0)
  }

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
      setValidezDias(cotizacion.validez_dias ?? 5)
      setLineas(
        (cotizacion.lineas ?? []).map((l, i) => calcLinea({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          descuento: l.descuento ?? 0,
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

  const isLocked = cotizacion?.is_locked ?? false
  const isExpired = cotizacion != null
    && cotizacion.fecha_expiracion < new Date().toISOString().slice(0, 10)

  const selectedEmpresa = empresas.find(e => e.id === empresaId) ?? null
  const empresaSinCredito = selectedEmpresa != null && (selectedEmpresa.linea_credito == null || selectedEmpresa.linea_credito <= 0)
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
            const sinCredito = emp != null && (emp.linea_credito == null || emp.linea_credito <= 0)
            setTerminosPago(sinCredito ? 'al_contado' : (emp?.plazo_credito ?? 'al_contado'))
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
        const sinCredito = emp != null && (emp.linea_credito == null || emp.linea_credito <= 0)
        setTerminosPago(sinCredito ? 'al_contado' : (emp?.plazo_credito ?? 'al_contado'))
      } else {
        setTerminosPago('')
      }
    })
  }

  useEffect(() => {
    if (empresaId && !clienteId) {
      setClienteModalOpen(true)
    }
  }, [empresaId, clienteId])

  function handleClienteSelect(cliente: Cliente) {
    withRevokeGuard(() => {
      setClienteId(cliente.id)
      setContacto(cliente.nombre)
      setCorreo(cliente.email ?? '')
      setClienteModalOpen(false)
    })
  }

  const selectedCliente = clientes.find(c => c.id === clienteId) ?? null

  async function fetchAutocomplete(q: string) {
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
    } catch {
      setAutocompleteResults([])
    }
  }

  function handleDescripcionChange(idx: number, value: string, e: React.ChangeEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.bottom + 280 > window.innerHeight
    setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
    setAutocompleteIdx(idx)
    fetchAutocomplete(value)
    updateLinea(idx, { descripcion: value })
  }

  function handleDescripcionFocus(idx: number, value: string, e: React.FocusEvent<HTMLInputElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const above = rect.bottom + 280 > window.innerHeight
    setDropdownRect({ top: above ? rect.top : rect.bottom, left: rect.left, width: rect.width, above })
    setAutocompleteIdx(idx)
    fetchAutocomplete(value)
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
        _costo: producto.precio_costo != null ? Number(producto.precio_costo) : null,
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
    setRevoking(true)
    revokeDialog.pendingChange()
    setRevokeDialog(null)
    setMarginStatus(prev => prev ? { ...prev, blocked: true, estado: 'revocada' } : prev)
    try {
      await api.patch(`/api/aprobaciones_margen/${marginStatus.aprobacion_id}`, { accion: 'revocar' })
    } catch {
    } finally {
      setRevoking(false)
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
    const vn = Number(prod.precio_venta)
    const costo = prod.precio_costo != null ? Number(prod.precio_costo) : null
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
    if (!empresa?.linea_credito) { onProceed?.(); return }
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
        terminos_pago: empresaSinCredito ? 'al_contado' : (terminosPago || null),
        validez_dias: validezDias,
      }
      const lineasPayload = lineas.map((l, i) => ({
        orden: i + 1,
        producto_id: l.producto_id,
        sku: l.sku,
        descripcion: l.descripcion,
        formato: l.formato,
        cantidad: l.cantidad,
        valor_neto: l.valor_neto,
        descuento: l.descuento ?? 0,
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
      setValidezDias(cotizacion.validez_dias ?? 5)
      setLineas(
        (cotizacion.lineas ?? []).map((l, i) => calcLinea({
          ...l,
          _key: `${l.id ?? i}`,
          producto_id: l.producto_id ?? null,
          sku: l.sku ?? null,
          formato: l.formato ?? null,
          descuento: l.descuento ?? 0,
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
    onSuccess: () => toast.success('Email enviado correctamente'),
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al enviar email'),
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

  const dirtyBorder = 'border-warning-400 dark:border-warning-500'

  const pdfDisabledTitle =
    lineasErrors.length > 0 ? lineasErrors.join(' | ')
    : (!isAdmin && marginStatus?.blocked) ? 'Requiere aprobación de márgenes'
    : tpBlocked ? 'Requiere aprobación de términos de pago'
    : undefined

  const crearNvDisabledTitle =
    cotizacion?.estado === 'cerrada_fv' ? 'Ya existe una nota de venta para esta cotización'
    : isExpired ? 'Cotización expirada — cambie la fecha de emisión'
    : lineasErrors.length > 0 ? lineasErrors.join(' | ')
    : isDirty ? 'Guarda los cambios antes de crear la NV'
    : undefined

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Volver"
            onClick={() => navigate('/cotizaciones')}
          >
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white font-num">
            {isNew ? 'Nueva cotización' : `COT-${String(cotizacion?.numero ?? '').padStart(5, '0')}`}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && (
            <>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<FileText />}
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                  openPdf(`/api/cotizaciones/${id}/pdf`)
                }}
                disabled={(!isAdmin && !!marginStatus?.blocked) || tpBlocked || lineasErrors.length > 0}
                title={pdfDisabledTitle}
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
                disabled={emailMut.isPending || (!isAdmin && !!marginStatus?.blocked) || tpBlocked || lineasErrors.length > 0}
                loading={emailMut.isPending}
                title={pdfDisabledTitle}
              >
                Email
              </Button>
              <Button
                size="sm"
                variant="success"
                leftIcon={<Plus />}
                onClick={() => checkCredit(total, 'request', () => crearNvMut.mutate(), { empresa_id: Number(empresaId), total, origen: 'cotizacion', cotizacion_id: Number(id) })}
                disabled={crearNvMut.isPending || lineasErrors.length > 0 || isDirty || cotizacion?.estado === 'cerrada_fv' || isExpired}
                loading={crearNvMut.isPending}
                title={crearNvDisabledTitle}
              >
                Crear NV
              </Button>
            </>
          )}
          {!isAdmin && !isNew && Object.keys(propuestas).length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSolicitudMargenModal(true)}
            >
              Solicitar ajuste de márgenes
            </Button>
          )}
          {!isLocked && (
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={saving || lineasErrors.length > 0}
              title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
            >
              Guardar
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-600 dark:text-danger-400">
          {error}
        </div>
      )}

      {!isNew && aprobacionCredito && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 border ${
          aprobacionCredito.estado === 'pendiente'
            ? 'bg-info-50 dark:bg-info-500/10 border-info-200 dark:border-info-800 text-info-700 dark:text-info-300'
            : aprobacionCredito.estado === 'aprobada'
            ? 'bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-800 text-success-700 dark:text-success-300'
            : 'bg-danger-50 dark:bg-danger-500/10 border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400'
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
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          aprobacionMargen.estado === 'pendiente'
            ? 'bg-info-50 dark:bg-info-500/10 border-info-200 dark:border-info-800 text-info-700 dark:text-info-300'
            : aprobacionMargen.estado === 'aprobada'
            ? 'bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-800 text-success-700 dark:text-success-300'
            : 'bg-danger-50 dark:bg-danger-500/10 border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400'
        }`}>
          {aprobacionMargen.estado === 'pendiente' && 'Solicitud de ajuste de márgenes enviada — pendiente de aprobación'}
          {aprobacionMargen.estado === 'aprobada' && 'Solicitud aprobada — los precios han sido actualizados'}
          {aprobacionMargen.estado === 'denegada' && 'Solicitud de ajuste de márgenes denegada'}
        </div>
      )}

      {!isAdmin && marginStatus?.blocked && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${
          marginStatus.estado === 'pendiente'
            ? 'bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-800 text-warning-700 dark:text-warning-300'
            : 'bg-danger-50 dark:bg-danger-500/10 border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400'
        }`}>
          {marginStatus.estado === 'pendiente'
            ? 'Precios modificados — solicitud de aprobacion pendiente. PDF y email deshabilitados.'
            : 'Precios modificados requieren aprobacion antes de generar PDF o enviar email.'}
        </div>
      )}

      {!isAdmin && !isNew && tpBlocked && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-800 text-warning-700 dark:text-warning-300">
          {terminosPagoEstado === 'pendiente'
            ? 'Términos de pago extendidos — pendiente de aprobación. PDF y email deshabilitados.'
            : 'Los términos de pago requieren aprobación antes de generar PDF o enviar email.'}
        </div>
      )}
      {!isAdmin && !isNew && terminosPagoEstado === 'rechazado' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 bg-danger-50 dark:bg-danger-500/10 border-danger-200 dark:border-danger-800 text-danger-600 dark:text-danger-400">
          Términos de pago rechazados por el administrador. Actualiza los términos y guarda.
        </div>
      )}
      {isAdmin && !isNew && cotizacion?.terminos_pago_estado === 'pendiente' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-800 text-warning-700 dark:text-warning-300 flex items-center justify-between gap-3">
          <span>Términos de pago extendidos requieren aprobación: <strong>{cotizacion.terminos_pago}</strong></span>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="success"
              onClick={() => approveTerminosPagoMut.mutate('aprobado')}
              disabled={approveTerminosPagoMut.isPending}
              loading={approveTerminosPagoMut.isPending}
            >
              Aprobar
            </Button>
            <Button
              size="xs"
              variant="danger"
              onClick={() => approveTerminosPagoMut.mutate('rechazado')}
              disabled={approveTerminosPagoMut.isPending}
            >
              Rechazar
            </Button>
          </div>
        </div>
      )}

      {isExpired && !isLocked && (
        <div className="mb-4 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-700 dark:bg-warning-500/10 dark:text-warning-300 flex items-center gap-2">
          <AlertTriangle size={15} />
          Esta cotización está expirada. Cambie la fecha de emisión para poder generar una NV.
        </div>
      )}
      {isLocked && (
        <div className="mb-4 rounded-lg border border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-500/10 px-4 py-3 text-sm text-warning-800 dark:text-warning-300 flex items-center gap-2">
          <Lock size={15} />
          Este documento está bloqueado — se generó una Nota de Venta desde esta cotización.
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
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <Select
                    value={empresaId ? String(empresaId) : 'none'}
                    onValueChange={v => handleEmpresaChange(v === 'none' ? '' : Number(v))}
                    disabled={!!clienteId || isLocked}
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
                </div>
                {empresaId && !isLocked && (
                  <Tooltip label="Seleccionar cliente de esta empresa">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => setClienteModalOpen(true)}
                      aria-label="Seleccionar cliente de esta empresa"
                    >
                      <UserPlus size={15} />
                    </Button>
                  </Tooltip>
                )}
              </div>
            </FormField>

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
                    className="ml-auto flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                    title="Editar cliente"
                  >
                    <ExternalLink size={11} /> Editar cliente
                  </button>
                </div>
              </div>
            )}

            <FormField label="Fecha">
              <Input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                disabled={isLocked}
                className={df('fecha', fecha) ? dirtyBorder : ''}
              />
            </FormField>

            <FormField label="Estado">
              <Select
                value={estado}
                onValueChange={v => setEstado(v)}
                disabled={isLocked}
              >
                <SelectTrigger className={df('estado', estado) ? dirtyBorder : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map(e => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <FormField
              label={
                <span className="flex items-center gap-2">
                  Términos de Pago
                  {!empresaSinCredito && terminosPagoNeedsApproval && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-warning-100 dark:bg-warning-500/20 text-warning-700 dark:text-warning-300 rounded font-medium">
                      Requiere aprobación
                    </span>
                  )}
                </span>
              }
              className="sm:col-span-2 lg:col-span-2"
              hint={empresaSinCredito ? 'Esta empresa no tiene línea de crédito.' : undefined}
            >
              {empresaSinCredito ? (
                <Select value="al_contado" disabled onValueChange={() => {}}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="al_contado">Al contado</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Select
                    value={terminosPago || 'none'}
                    onValueChange={v => setTerminosPago(v === 'none' ? '' : v)}
                    disabled={isLocked}
                  >
                    <SelectTrigger className={df('terminosPago', terminosPago) ? dirtyBorder : ''}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Seleccionar —</SelectItem>
                      <SelectItem value="Al contado">Al contado</SelectItem>
                      <SelectItem value="30 Días">30 Días</SelectItem>
                      <SelectItem value="60 Días">60 Días</SelectItem>
                      <SelectItem value="90 Días">90 Días</SelectItem>
                      <SelectItem value="120 Días">120 Días</SelectItem>
                    </SelectContent>
                  </Select>
                  {adminTerminosWarning && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning-600 dark:text-warning-400">
                      <AlertTriangle size={14} className="shrink-0" />
                      Plazo supera el límite de la empresa ({empresaPlazo})
                    </p>
                  )}
                </>
              )}
            </FormField>

            <FormField
              label="Validez (días)"
              hint={
                cotizacion?.fecha_expiracion
                  ? `Válido hasta: ${new Date(cotizacion.fecha_expiracion + 'T00:00:00').toLocaleDateString('es-CL')}`
                  : undefined
              }
            >
              <Input
                type="number"
                min={1}
                value={validezDias}
                onChange={e => setValidezDias(Number(e.target.value))}
                disabled={isLocked}
                className={df('validezDias', validezDias) ? dirtyBorder : ''}
              />
              {isExpired && cotizacion?.fecha_expiracion && (
                <p className="text-xs mt-1 text-warning-600 dark:text-warning-400 font-medium">
                  Cotización expirada
                </p>
              )}
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <Table density="compact">
          <THead>
            <TR>
              <TH className="text-center w-8">#</TH>
              <TH>Producto</TH>
              <TH className="text-right w-20">Cant.</TH>
              <TH className="text-right w-32">Precio Unit.</TH>
              <TH className="text-right w-20">Desc %</TH>
              <TH className="text-right w-32">Total Neto</TH>
              <TH className="text-right w-20">Margen</TH>
              <TH className="w-8" />
            </TR>
          </THead>
          <TBody>
            {lineas.map((linea, idx) => (
              <TR key={linea._key} className={`align-top ${lineaDirty(idx) ? 'bg-warning-50 dark:bg-warning-500/5' : ''}`}>
                <TD className="text-center text-gray-400 font-num">{idx + 1}</TD>
                <TD className="relative">
                  <Input
                    size="sm"
                    type="text"
                    value={linea.descripcion}
                    onChange={e => handleDescripcionChange(idx, e.target.value, e)}
                    onFocus={e => handleDescripcionFocus(idx, linea.descripcion, e)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 150)}
                    disabled={isLocked}
                    placeholder="Buscar en catálogo..."
                  />
                  {linea.producto_id && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-400 dark:text-gray-500 px-1 font-num">
                      {linea.sku && <span>SKU: {linea.sku}</span>}
                      {linea.formato && <span>{linea.formato}</span>}
                      {linea._stock != null && (
                        <span className={linea.cantidad > linea._stock ? 'text-warning-600 dark:text-warning-400' : ''}>
                          Stock: {linea._stock}
                        </span>
                      )}
                    </div>
                  )}
                </TD>
                <TD>
                  <Input
                    size="sm"
                    type="number"
                    min="1"
                    value={linea.cantidad}
                    onChange={e => withRevokeGuard(() => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }))}
                    disabled={isLocked}
                    className={`text-right font-num ${linea._stock != null && linea.cantidad > linea._stock ? 'border-warning-400 dark:border-warning-500' : ''}`}
                  />
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    {linea.producto_id && (
                      <Tooltip label="Restablecer precio">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleResetPrecio(idx)}
                          aria-label="Restablecer precio"
                          className="text-gray-400 hover:text-brand-600"
                        >
                          <RotateCcw size={12} />
                        </Button>
                      </Tooltip>
                    )}
                    {isAdmin ? (
                      <Input
                        size="sm"
                        type="text"
                        inputMode="numeric"
                        value={focusedPrecioIdx === idx ? String(linea.valor_neto) : Math.round(Number(linea.valor_neto) || 0).toLocaleString('es-CL')}
                        onFocus={() => setFocusedPrecioIdx(idx)}
                        onBlur={() => setFocusedPrecioIdx(null)}
                        onChange={e => handleValorNetoChange(idx, e.target.value)}
                        disabled={isLocked}
                        className="w-28 text-right font-num"
                      />
                    ) : (
                      <div className="text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white font-num">
                          {fmtMoney(linea.valor_neto)}
                        </span>
                        {linea.id != null && propuestas[linea.id] != null && (
                          <div className="text-xs text-info-600 dark:text-info-400 font-num">
                            → {fmtMoney(propuestas[linea.id].valorNetoPropuesto)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TD>
                <TD>
                  {isLocked ? (
                    <span className="block text-right text-sm text-gray-900 dark:text-white pr-1 font-num">
                      {Number(linea.descuento ?? 0) > 0 ? `${linea.descuento}%` : '—'}
                    </span>
                  ) : (
                    <Input
                      size="sm"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={linea.descuento ?? 0}
                      onChange={e => updateLinea(idx, { descuento: Number(e.target.value) })}
                      className="w-16 text-right font-num"
                    />
                  )}
                </TD>
                <TD className="text-right text-gray-700 dark:text-gray-300 text-sm font-medium font-num">{fmtMoney(linea.total_neto)}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-0.5">
                    {isAdmin ? (
                      <Input
                        size="sm"
                        type="number"
                        step="0.1"
                        value={linea.margen !== null ? linea.margen * 100 : ''}
                        onChange={e => handleMargenChange(idx, e.target.value)}
                        placeholder="—"
                        disabled={isLocked}
                        className={`w-16 text-right font-num ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'border-warning-400 dark:border-warning-500 text-warning-600 dark:text-warning-400' : 'text-success-600 dark:text-success-400'}`}
                      />
                    ) : linea.id != null ? (
                      <Input
                        size="sm"
                        type="number"
                        step="0.1"
                        value={linea.id != null && propuestas[linea.id] != null
                          ? (propuestas[linea.id].margenPropuesto * 100).toFixed(1)
                          : (linea.margen !== null ? (Number(linea.margen) * 100).toFixed(1) : '')}
                        onChange={e => linea.id != null && handleMargenPropuesta(linea.id, e.target.value)}
                        placeholder="—"
                        disabled={isLocked}
                        title="Proponer cambio de margen"
                        className={`w-16 text-right font-num border-dashed ${
                          linea.id != null && propuestas[linea.id] != null
                            ? 'border-info-400 text-info-600 dark:text-info-400'
                            : linea.margen !== null && Number(linea.margen) < 0.15
                            ? 'border-warning-300 text-warning-600 dark:text-warning-400'
                            : 'text-success-600 dark:text-success-400'
                        }`}
                      />
                    ) : (
                      <span className={`text-xs font-num ${linea.margen !== null && Number(linea.margen) < 0.15 ? 'text-warning-600 dark:text-warning-400' : 'text-success-600 dark:text-success-400'}`}>
                        {linea.margen !== null ? `${(Number(linea.margen) * 100).toFixed(1)}` : '—'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </TD>
                <TD>
                  {!isLocked && (
                    <Tooltip label="Eliminar línea">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => removeLinea(idx)}
                        disabled={lineas.length === 1}
                        aria-label="Eliminar línea"
                        className="text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </Tooltip>
                  )}
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

      {!isNew && cotizacion && (
        <div className="mt-5">
          <TareasRelacionadas tipo="cotizacion" id={cotizacion.id} />
        </div>
      )}

      <Modal open={!!revokeDialog} onOpenChange={open => { if (!open) setRevokeDialog(null) }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Revocar aprobacion de margenes</ModalTitle>
            <ModalDescription>
              Esta cotizacion tiene aprobacion de margenes vigente. Modificarla revocara la aprobacion y bloqueara el PDF y email. Continuar?
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setRevokeDialog(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmRevoke} loading={revoking}>Continuar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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

      <ClienteSelectModal
        open={clienteModalOpen}
        empresaId={typeof empresaId === 'number' ? empresaId : 0}
        empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
        onSelect={handleClienteSelect}
        onClose={() => setClienteModalOpen(false)}
      />

      <Modal
        open={solicitudMargenModal}
        onOpenChange={open => {
          if (!open) {
            setSolicitudMargenModal(false)
            setSolicitudMargenError('')
            setNotaSolicitud('')
          }
        }}
      >
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Solicitar ajuste de márgenes</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH className="text-right">Precio actual</TH>
                  <TH className="text-right">Precio propuesto</TH>
                  <TH className="text-right">Margen prop.</TH>
                </TR>
              </THead>
              <TBody>
                {lineas
                  .filter(l => l.id != null && propuestas[l.id!] != null)
                  .map(l => (
                    <TR key={l._key}>
                      <TD className="text-gray-900 dark:text-white truncate max-w-[180px]">{l.descripcion}</TD>
                      <TD className="text-right text-gray-600 dark:text-gray-400 font-num">{fmtMoney(l.valor_neto)}</TD>
                      <TD className="text-right text-info-600 dark:text-info-400 font-medium font-num">
                        {fmtMoney(propuestas[l.id!].valorNetoPropuesto)}
                      </TD>
                      <TD className="text-right text-info-600 dark:text-info-400 font-medium font-num">
                        {(propuestas[l.id!].margenPropuesto * 100).toFixed(1)}%
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
            <div className="mt-4">
              <Textarea
                placeholder="Nota para el administrador (opcional)..."
                value={notaSolicitud}
                onChange={e => setNotaSolicitud(e.target.value)}
                rows={2}
              />
            </div>
            {solicitudMargenError && (
              <p className="text-xs text-danger-600 dark:text-danger-400 mt-2">{solicitudMargenError}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => { setSolicitudMargenModal(false); setSolicitudMargenError(''); setNotaSolicitud('') }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEnviarSolicitudMargen}
              disabled={enviandoSolicitud}
              loading={enviandoSolicitud}
            >
              Enviar solicitud
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-elev-3 overflow-hidden max-h-64 overflow-y-auto"
        >
          {autocompleteResults.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { selectProducto(autocompleteIdx, p); setAutocompleteIdx(null); setAutocompleteResults([]) }}
              className="w-full text-left px-3 py-2.5 hover:bg-brand-50 dark:hover:bg-brand-500/10 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{p.nombre}</div>
              <div className="flex gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400 font-num">
                {p.sku && <span>SKU: {p.sku}</span>}
                {p.formato && <span>{p.formato}</span>}
                <span className="ml-auto font-medium text-gray-700 dark:text-gray-300">{fmtMoney(p.precio_venta)}</span>
                <span className={p.stock_actual > 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}>Stock: {p.stock_actual}</span>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
