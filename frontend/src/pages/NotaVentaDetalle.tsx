import { openPdf } from '../lib/pdf'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, Mail, ArrowLeft, ExternalLink, Receipt } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { NotaVenta, NotaVentaLinea, Cliente, User, Producto, Empresa } from '../types'
import CreditWarningModal, { type CreditoInfo, type AprobacionPayload } from '../components/CreditWarningModal'
import UnsavedChangesModal from '../components/UnsavedChangesModal'

type LineaLocal = Omit<NotaVentaLinea, 'id'> & { id?: number; _key: string }

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente:  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  despachada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  entregada:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  pagada:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelada:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
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
    direccionDespacho: nv.direccion_despacho ?? '',
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

  const [clienteId, setClienteId] = useState<number | ''>('')
  const [vendedorId, setVendedorId] = useState<number | ''>(currentUser?.id ?? '')
  const [contacto, setContacto] = useState('')
  const [correo, setCorreo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nota, setNota] = useState('')
  const [retiroEnConico, setRetiroEnConico] = useState(false)
  const [direccionDespacho, setDireccionDespacho] = useState('')
  const [lineas, setLineas] = useState<LineaLocal[]>([newLinea(1)])
  const [empresaId, setEmpresaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [creditModal, setCreditModal] = useState<{
    credito: CreditoInfo
    aprobacionPayload?: AprobacionPayload
    adminOverride?: boolean
  } | null>(null)

  const [unsavedModal, setUnsavedModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<'pdf' | 'email' | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  const lineasErrors = useMemo(() => getLineasErrors(lineas), [lineas])

  const currentSnapshot = useMemo(() => JSON.stringify({
    clienteId, vendedorId, contacto, correo, fecha, nota, empresaId,
    retiroEnConico, direccionDespacho,
    lineas: lineas.map(l => ({
      producto_id: l.producto_id ?? null,
      cantidad: l.cantidad,
      valor_neto: l.valor_neto,
      descripcion: l.descripcion ?? '',
      sku: l.sku ?? null,
      formato: l.formato ?? null,
    }))
  }), [clienteId, vendedorId, contacto, correo, fecha, nota, empresaId, retiroEnConico, direccionDespacho, lineas])

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
      setDireccionDespacho(nv.direccion_despacho ?? '')
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
        if (c.empresa_id && !empresaId) setEmpresaId(c.empresa_id)
      }
    }
  }

  const fetchAutocomplete = useCallback(async (q: string) => {
    if (q.length < 2) { setAutocompleteResults([]); return }
    try {
      const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
      setAutocompleteResults(res.data)
    } catch { setAutocompleteResults([]) }
  }, [])

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
        valor_neto: producto.precio_venta,
        margen: producto.precio_venta > 0
          ? (producto.precio_venta - producto.precio_costo) / producto.precio_venta
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
    if (!empresa?.limite_credito) { onProceed(); return }
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
        direccion_despacho: retiroEnConico ? null : (direccionDespacho.trim() || null),
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
      setDireccionDespacho(nv.direccion_despacho ?? '')
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
      setShowEstadoMenu(false)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Error al cambiar estado')
      setShowEstadoMenu(false)
    },
  })

  const emailMut = useMutation({
    mutationFn: () => api.post(`/api/nota_ventas/${id}/email`),
    onSuccess: () => {
      setEmailToast({ msg: 'Email enviado correctamente', ok: true })
      setTimeout(() => setEmailToast(null), 3500)
    },
    onError: (err: any) => {
      setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false })
      setTimeout(() => setEmailToast(null), 4000)
    },
  })

  const genFacturaMut = useMutation({
    mutationFn: () => api.post(`/api/facturas/from_nv/${id}`),
    onSuccess: (res: any) => navigate(`/facturas/${res.data.id}`),
  })

  const validTransitions = !isNew && nv ? getValidTransitions(nv.estado, isAdmin) : []

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/notas-venta')}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva nota de venta' : `NV-${String(nv?.numero ?? '').padStart(5, '0')}`}
          </h1>
          {!isNew && nv && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`}>
              {ESTADO_LABELS[nv.estado] ?? nv.estado}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && nv && validTransitions.length > 0 && (
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
                    <button key={t} onClick={() => estadoMut.mutate(t)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg text-gray-700 dark:text-gray-300">
                      → {ESTADO_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!isNew && (
            <>
              <button
                onClick={() => {
                  if (lineasErrors.length > 0) return
                  if (isDirty) { setPendingAction('pdf'); setUnsavedModal(true); return }
                  openPdf(`/api/nota_ventas/${id}/pdf`)
                }}
                disabled={lineasErrors.length > 0}
                title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
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
                disabled={emailMut.isPending || lineasErrors.length > 0}
                title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail size={15} />
                {emailMut.isPending ? 'Enviando...' : 'Email'}
              </button>
              {nv?.factura_id == null && (
                <button
                  onClick={() => genFacturaMut.mutate()}
                  disabled={genFacturaMut.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Receipt size={15} /> Generar Factura
                </button>
              )}
              {nv?.factura_id != null && (
                <Link
                  to={`/facturas/${nv.factura_id}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200"
                >
                  <Receipt size={15} /> Ver Factura
                </Link>
              )}
            </>
          )}
          {!isLocked && (
            <button
              onClick={handleSave}
              disabled={saving || lineasErrors.length > 0}
              title={lineasErrors.length > 0 ? lineasErrors.join(' | ') : undefined}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>

      {!isNew && nv?.cotizacion_id && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Originada desde cotización:</span>
          <button
            onClick={() => navigate(`/cotizaciones/${nv.cotizacion_id}`)}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            COT-{String(nv.cotizacion?.numero ?? nv.cotizacion_id).padStart(5, '0')}
            <ExternalLink size={11} />
          </button>
        </div>
      )}

      {isLocked && (
        <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          Este documento está bloqueado — se generó una Factura desde esta nota de venta.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente *</label>
            <select value={clienteId} onChange={e => handleClienteChange(e.target.value ? Number(e.target.value) : '')}
              disabled={isLocked}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('clienteId', clienteId) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.rut ? ` · ${c.rut}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Empresa</label>
            <select value={empresaId} onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
              disabled={isLocked}
              className={`w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed ${df('empresaId', empresaId) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-600'}`}>
              <option value="">— Sin empresa —</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          {empresaId !== '' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Términos de pago
              </label>
              {empresaSinCredito ? (
                <>
                  <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 cursor-not-allowed">
                    Al contado
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Esta empresa no tiene línea de crédito.
                  </p>
                </>
              ) : (
                <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {nv?.terminos_pago ?? '—'}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contacto</label>
            <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
              disabled={isLocked}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('contacto', contacto) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
              placeholder="Nombre del contacto" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Correo</label>
            <input type="email" value={correo} onChange={e => setCorreo(e.target.value)}
              disabled={isLocked}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('correo', correo) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
              placeholder="email@ejemplo.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              disabled={isLocked}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('fecha', fecha) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`} />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Encargado</label>
              <select value={vendedorId} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : '')}
                disabled={isLocked}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('vendedorId', vendedorId) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nota / Observaciones</label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              disabled={isLocked}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed ${df('nota', nota) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
              placeholder="Notas internas o para el cliente..." />
          </div>
          {/* Despacho */}
          <div className="sm:col-span-2 lg:col-span-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={retiroEnConico}
                disabled={isLocked}
                onChange={e => {
                  setRetiroEnConico(e.target.checked)
                  if (e.target.checked) setDireccionDespacho('')
                }}
                className="rounded border-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className={`text-sm font-medium ${df('retiroEnConico', retiroEnConico) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>Retiro en Conico</span>
            </label>
            {!retiroEnConico && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Dirección de despacho <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={direccionDespacho}
                  disabled={isLocked}
                  onChange={e => setDireccionDespacho(e.target.value)}
                  placeholder="Calle, número, ciudad"
                  className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${df('direccionDespacho', direccionDespacho) ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[900px]">
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
              <th className="px-3 py-3 font-medium text-right w-20">Margen</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lineas.map((linea, idx) => (
              <tr key={linea._key} className={lineaDirty(idx) ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  <input type="text" value={linea.sku ?? ''} onChange={e => updateLinea(idx, { sku: e.target.value || null })}
                    disabled={isLocked}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="SKU" />
                </td>
                <td className="px-3 py-2 relative">
                  <input type="text" value={linea.descripcion}
                    disabled={isLocked}
                    onChange={e => handleDescripcionChange(idx, e.target.value)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 200)}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Descripción..." />
                  {autocompleteIdx === idx && autocompleteResults.length > 0 && (
                    <div className="absolute z-20 left-3 right-3 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                      {autocompleteResults.slice(0, 8).map(p => (
                        <button key={p.id} type="button" onMouseDown={() => selectProducto(idx, p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                          <div className="text-gray-500">{p.sku ? `SKU: ${p.sku}` : ''}{p.formato ? ` · ${p.formato}` : ''} · $ {p.precio_venta.toLocaleString('es-CL')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={linea.formato ?? ''} onChange={e => updateLinea(idx, { formato: e.target.value || null })}
                    disabled={isLocked}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Formato" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="1" value={linea.cantidad}
                    disabled={isLocked}
                    onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right disabled:opacity-60 disabled:cursor-not-allowed" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0" value={linea.valor_neto}
                    disabled={isLocked}
                    onChange={e => updateLinea(idx, { valor_neto: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-right disabled:opacity-60 disabled:cursor-not-allowed" />
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 text-xs font-medium">{fmtMoney(linea.total_neto)}</td>
                <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 text-xs">{fmtMoney(linea.iva)}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-white text-xs font-medium">{fmtMoney(linea.total)}</td>
                <td className="px-3 py-2 text-right text-xs">
                  {linea.margen !== null
                    ? <span className={linea.margen >= 0.15 ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}>{(linea.margen * 100).toFixed(1)}%</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeLinea(idx)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" disabled={lineas.length === 1 || isLocked}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between">
        {!isLocked && (
          <button onClick={addLinea}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
            <Plus size={15} />
            Agregar línea
          </button>
        )}
        {isLocked && <div />}
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
    </div>
  )
}
