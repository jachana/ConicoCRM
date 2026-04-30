import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus, FileSpreadsheet, Eye, Pencil, Trash2, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import { validateRut, cleanRut } from '../utils/rut'
import type { Empresa, EmpresaListItem, DeudaBulkItem, SedeDespacho } from '../types'
import EmpresaFilters from '../components/EmpresaFilters'
import EmpresaDetailModal from '../components/EmpresaDetailModal'
import {
  Button, Input, Textarea, EmptyState, Skeleton, FormField,
  Card, CardContent,
  Table, THead, TBody, TR, TH, TD,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
} from '../components/ui'

const PLAZO_OPTIONS = ['Al contado', '30 Dias', '60 Dias', '90 Dias', 'Especial']

type SedeForm = { nombre: string; direccion: string }
const EMPTY_SEDE: SedeForm = { nombre: '', direccion: '' }

type FormData = {
  nombre: string
  razon_social: string
  rut: string
  rut_no_oficial: boolean
  linea_credito: string
  plazo_credito: string
  sector: string
  email: string
  nota_cobranza: string
  ubicacion: string
  ruts_adicionales: string[]
}

const EMPTY_FORM: FormData = {
  nombre: '', razon_social: '', rut: '',
  rut_no_oficial: false,
  linea_credito: '', plazo_credito: '',
  sector: '', email: '', nota_cobranza: '', ubicacion: '',
  ruts_adicionales: [],
}

type SortField = 'nombre' | 'rut' | 'sector' | 'ultima_compra' | 'deuda_total' | 'deuda_vencida'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function Empresas() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [busqueda, setBusqueda] = useState('')
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusqueda(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const [sector, setSector] = useState<string | null>(null)
  const [productoIds, setProductoIds] = useState<number[]>([])
  const [productoNombres, setProductoNombres] = useState<string[]>([])
  const [detalleEmpresa, setDetalleEmpresa] = useState<EmpresaListItem | null>(null)

  const { data: empresas = [], isLoading } = useQuery<EmpresaListItem[]>({
    queryKey: ['empresas', debouncedBusqueda, sector, productoIds],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedBusqueda })
      if (sector) params.set('sector', sector)
      productoIds.forEach(id => params.append('producto_ids', String(id)))
      return api.get(`/api/empresas/?${params.toString()}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [rutError, setRutError] = useState<string | null>(null)
  const [rutAdicionalInput, setRutAdicionalInput] = useState('')
  const [rutAdicionalError, setRutAdicionalError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { data: deudaBulk = [] } = useQuery<DeudaBulkItem[]>({
    queryKey: ['empresas-deuda-bulk'],
    queryFn: () => api.get('/api/empresas/deuda-bulk').then(r => r.data),
  })

  const deudaMap = useMemo(
    () => new Map<number, DeudaBulkItem>(deudaBulk.map(d => [d.empresa_id, d])),
    [deudaBulk]
  )

  const [sortField, setSortField] = useState<SortField>('deuda_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterConDeuda, setFilterConDeuda] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('create') !== 'true') return
    const rut = searchParams.get('rut') || ''
    const nombre = searchParams.get('nombre') || ''
    const email = searchParams.get('email') || ''
    setForm({ ...EMPTY_FORM, rut, nombre, email })
    setEditando(null)
    setModalOpen(true)
    setSearchParams({}, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDeuda = deudaBulk.reduce((s, d) => s + Number(d.deuda_total), 0)
  const totalVencida = deudaBulk.reduce((s, d) => s + Number(d.deuda_vencida), 0)
  const empresasConDeuda = deudaBulk.filter(d => Number(d.deuda_total) > 0).length

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const displayEmpresas = [...empresas]
    .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
    .sort((a, b) => {
      const da = deudaMap.get(a.id)
      const db = deudaMap.get(b.id)
      let cmp = 0
      if (sortField === 'deuda_total') {
        cmp = Number(da?.deuda_total ?? 0) - Number(db?.deuda_total ?? 0)
      } else if (sortField === 'deuda_vencida') {
        cmp = Number(da?.deuda_vencida ?? 0) - Number(db?.deuda_vencida ?? 0)
      } else if (sortField === 'ultima_compra') {
        const ta = a.ultima_compra ? new Date(a.ultima_compra + 'T00:00:00').getTime() : 0
        const tb = b.ultima_compra ? new Date(b.ultima_compra + 'T00:00:00').getTime() : 0
        cmp = ta - tb
      } else {
        const va = String(a[sortField as keyof EmpresaListItem] ?? '')
        const vb = String(b[sortField as keyof EmpresaListItem] ?? '')
        cmp = va.localeCompare(vb, 'es-CL')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(e: Empresa) {
    setEditando(e)
    setForm({
      nombre: e.nombre, razon_social: e.razon_social ?? '', rut: e.rut ?? '',
      rut_no_oficial: e.rut_no_oficial,
      linea_credito: e.linea_credito != null ? String(e.linea_credito) : '',
      plazo_credito: e.plazo_credito ?? '',
      sector: e.sector ?? '',
      email: e.email ?? '', nota_cobranza: e.nota_cobranza ?? '', ubicacion: e.ubicacion ?? '',
      ruts_adicionales: e.ruts_adicionales ?? [],
    })
    setRutError(null); setRutAdicionalInput(''); setRutAdicionalError(null)
    setError(null); setModalOpen(true)
  }

  const agregarRutAdicional = useCallback(() => {
    const v = rutAdicionalInput.trim()
    if (!v) return
    if (!validateRut(v)) {
      setRutAdicionalError('RUT inválido')
      return
    }
    const cleaned = cleanRut(v)
    if (form.ruts_adicionales.includes(cleaned)) {
      setRutAdicionalError('RUT ya agregado')
      return
    }
    setForm(f => ({ ...f, ruts_adicionales: [...f.ruts_adicionales, cleaned] }))
    setRutAdicionalInput('')
    setRutAdicionalError(null)
  }, [rutAdicionalInput, form.ruts_adicionales])

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setError(null)
    setRutError(null)
    setRutAdicionalInput('')
    setRutAdicionalError(null)
    setSedes([])
    setSedeAdding(false)
    setSedeEditId(null)
    setSedeForm(EMPTY_SEDE)
    setSedeError(null)
    setSedeEliminandoId(null)
  }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v || null])
      )
      payload.rut_no_oficial = data.rut_no_oficial
      payload.ruts_adicionales = data.ruts_adicionales
      if (data.linea_credito) payload.linea_credito = parseFloat(data.linea_credito)
      else payload.linea_credito = null
      if (editando) return api.patch(`/api/empresas/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/empresas/', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresas'] })
      qc.invalidateQueries({ queryKey: ['empresas-deuda-bulk'] })
      cerrarModal()
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empresas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresas'] })
      qc.invalidateQueries({ queryKey: ['empresas-deuda-bulk'] })
      setEliminandoId(null)
      setDeleteError(null)
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  // Sedes de despacho
  const [sedes, setSedes] = useState<SedeDespacho[]>([])
  const [sedeForm, setSedeForm] = useState<SedeForm>(EMPTY_SEDE)
  const [sedeEditId, setSedeEditId] = useState<number | null>(null)
  const [sedeAdding, setSedeAdding] = useState(false)
  const [sedeError, setSedeError] = useState<string | null>(null)
  const [sedeSaving, setSedeSaving] = useState(false)
  const [sedeEliminandoId, setSedeEliminandoId] = useState<number | null>(null)

  useEffect(() => {
    if (editando) {
      api.get(`/api/sedes-despacho/?empresa_id=${editando.id}`)
        .then(r => setSedes(r.data))
        .catch(() => setSedes([]))
    } else {
      setSedes([])
    }
  }, [editando])

  async function guardarSede() {
    if (!editando) return
    setSedeSaving(true)
    setSedeError(null)
    try {
      if (sedeEditId !== null) {
        const r = await api.put(`/api/sedes-despacho/${sedeEditId}`, sedeForm)
        setSedes(prev => prev.map(s => s.id === sedeEditId ? r.data : s))
      } else {
        const r = await api.post('/api/sedes-despacho/', { ...sedeForm, empresa_id: editando.id })
        setSedes(prev => [...prev, r.data])
      }
      setSedeAdding(false)
      setSedeEditId(null)
      setSedeForm(EMPTY_SEDE)
    } catch (e: any) {
      setSedeError(e?.response?.data?.detail ?? 'Error al guardar sede')
    } finally {
      setSedeSaving(false)
    }
  }

  async function eliminarSede(id: number) {
    setSedeSaving(true)
    try {
      await api.delete(`/api/sedes-despacho/${id}`)
      setSedes(prev => prev.filter(s => s.id !== id))
      setSedeEliminandoId(null)
    } catch (e: any) {
      setSedeError(e?.response?.data?.detail ?? 'Error al eliminar sede')
    } finally {
      setSedeSaving(false)
    }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-400 ml-1">↕</span>
    return <span className="text-brand-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const HEADERS: { field: SortField; label: string; align?: 'right' }[] = [
    { field: 'nombre',        label: 'Nombre' },
    { field: 'rut',           label: 'RUT' },
    { field: 'sector',        label: 'Sector' },
    { field: 'ultima_compra', label: 'Última Compra' },
    { field: 'deuda_total',   label: 'Deuda',   align: 'right' },
    { field: 'deuda_vencida', label: 'Vencida', align: 'right' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Empresas</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileSpreadsheet />}
            onClick={() => api.get('/api/empresas/export/excel', { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data)
              const a = document.createElement('a'); a.href = url; a.download = 'empresas.xlsx'; a.click()
              URL.revokeObjectURL(url)
            })}
          >
            Excel
          </Button>
          <Button leftIcon={<Plus />} onClick={abrirCrear}>
            Agregar
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card variant="subtle">
          <CardContent className="py-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Deuda Total</div>
            <div className="text-lg font-bold font-num text-danger-600 dark:text-danger-400">{fmt(totalDeuda)}</div>
          </CardContent>
        </Card>
        <Card variant="subtle">
          <CardContent className="py-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Deuda Vencida</div>
            <div className={`text-lg font-bold font-num ${totalVencida > 0 ? 'text-warning-600 dark:text-warning-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {fmt(totalVencida)}
            </div>
          </CardContent>
        </Card>
        <Card variant="subtle">
          <CardContent className="py-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">Con Deuda</div>
            <div className="text-lg font-bold font-num text-gray-900 dark:text-gray-100">{empresasConDeuda}</div>
          </CardContent>
        </Card>
      </div>

      <EmpresaFilters
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        sector={sector}
        onSectorChange={setSector}
        productoIds={productoIds}
        productoNombres={productoNombres}
        onProductosChange={(ids, nombres) => { setProductoIds(ids); setProductoNombres(nombres) }}
        filterConDeuda={filterConDeuda}
        onFilterConDeudaChange={setFilterConDeuda}
        totalCount={displayEmpresas.length}
      />

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-elev-1 mt-3">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : displayEmpresas.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Sin empresas"
            description="No hay empresas que coincidan con los filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  {HEADERS.map(({ field, label, align }) => (
                    <TH
                      key={field}
                      onClick={() => toggleSort(field)}
                      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 select-none whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
                    >
                      {label}
                      <SortIndicator field={field} />
                    </TH>
                  ))}
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {displayEmpresas.map(e => {
                  const d = deudaMap.get(e.id)
                  const deudaTotal = Number(d?.deuda_total ?? 0)
                  const deudaVencida = Number(d?.deuda_vencida ?? 0)
                  const dimmed = deudaTotal === 0
                  return (
                    <TR key={e.id} className={dimmed ? 'opacity-70' : ''}>
                      <TD className="font-medium text-gray-900 dark:text-gray-100">{e.nombre}</TD>
                      <TD className="text-gray-500 dark:text-gray-400 font-num">{e.rut ?? '—'}</TD>
                      <TD className="text-gray-500 dark:text-gray-400">{e.sector ?? '—'}</TD>
                      <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">
                        {e.ultima_compra
                          ? new Date(e.ultima_compra + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </TD>
                      <TD className={`text-right font-num font-semibold whitespace-nowrap ${deudaTotal > 0 ? 'text-danger-600 dark:text-danger-400' : 'text-gray-400'}`}>
                        {deudaTotal > 0 ? fmt(deudaTotal) : '—'}
                      </TD>
                      <TD className={`text-right font-num whitespace-nowrap ${deudaVencida > 0 ? 'text-warning-600 dark:text-warning-400' : 'text-gray-400'}`}>
                        {deudaVencida > 0 ? fmt(deudaVencida) : '—'}
                      </TD>
                      <TD>
                        {eliminandoId === e.id ? (
                          <div className="flex items-center justify-end gap-2 text-xs">
                            {deleteError
                              ? <span className="text-danger-600 dark:text-danger-400">{deleteError}</span>
                              : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                            <Button size="xs" variant="danger" loading={eliminar.isPending} onClick={() => eliminar.mutate(e.id)}>
                              Sí
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => { setEliminandoId(null); setDeleteError(null) }}>
                              No
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="xs" variant="outline" leftIcon={<Eye />} onClick={() => setDetalleEmpresa(e)}>
                              Ver
                            </Button>
                            <Button size="icon-xs" variant="ghost" aria-label={`Editar ${e.nombre}`} onClick={() => abrirEditar(e)}>
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Eliminar ${e.nombre}`}
                              className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                              onClick={() => { setEliminandoId(e.id); setDeleteError(null) }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      <EmpresaDetailModal
        key={detalleEmpresa?.id}
        empresa={detalleEmpresa}
        onClose={() => setDetalleEmpresa(null)}
        onEdit={(e) => {
          setDetalleEmpresa(null)
          abrirEditar(e)
        }}
      />

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onOpenChange={(o) => { if (!o) cerrarModal() }}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>{editando ? 'Editar empresa' : 'Nueva empresa'}</ModalTitle>
          </ModalHeader>
          <form
            onSubmit={ev => {
              ev.preventDefault()
              if (form.rut && !form.rut_no_oficial && !validateRut(form.rut)) {
                setRutError('RUT inválido')
                return
              }
              setRutError(null)
              guardar.mutate(form)
            }}
            className="flex flex-col flex-1 min-h-0"
          >
            <ModalBody>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nombre" required className="col-span-2">
                  <Input
                    required
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  />
                </FormField>

                <FormField label="Razón Social">
                  <Input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
                </FormField>
                <FormField label="RUT" required>
                  <Input
                    required
                    placeholder="76.123.456-7"
                    value={form.rut}
                    onChange={e => { setForm(f => ({ ...f, rut: e.target.value })); setRutError(null) }}
                    onBlur={() => {
                      if (form.rut && !form.rut_no_oficial) {
                        setRutError(validateRut(form.rut) ? null : 'RUT inválido')
                      } else {
                        setRutError(null)
                      }
                    }}
                    disabled={!!editando}
                  />
                  {editando && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">El RUT no puede modificarse una vez creada la empresa</p>
                  )}
                  {!editando && rutError && (
                    <p className="text-xs text-danger-500 mt-1">{rutError}</p>
                  )}
                </FormField>

                <FormField label="RUT no oficial" className="col-span-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.rut_no_oficial}
                      onChange={e => {
                        setForm(f => ({ ...f, rut_no_oficial: e.target.checked }))
                        if (e.target.checked) setRutError(null)
                      }}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500"
                    />
                    <span>RUT no oficial (informativo)</span>
                  </label>
                </FormField>

                <div className="col-span-2">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">RUTs adicionales</div>
                  {form.ruts_adicionales.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.ruts_adicionales.map((r, i) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                        >
                          {r}
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, ruts_adicionales: f.ruts_adicionales.filter((_, j) => j !== i) }))}
                            className="text-gray-400 hover:text-danger-500 leading-none"
                            aria-label="Quitar RUT"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="76.123.456-7"
                      value={rutAdicionalInput}
                      onChange={e => { setRutAdicionalInput(e.target.value); setRutAdicionalError(null) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          agregarRutAdicional()
                        }
                      }}
                      size="sm"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={agregarRutAdicional}
                    >
                      Agregar
                    </Button>
                  </div>
                  {rutAdicionalError && (
                    <p className="text-xs text-danger-500 mt-1">{rutAdicionalError}</p>
                  )}
                </div>

                <FormField label="Sector">
                  <Input value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} />
                </FormField>
                <FormField label="Email">
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </FormField>

                <FormField label="Línea de Crédito ($)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.linea_credito}
                    onChange={e => setForm(f => ({ ...f, linea_credito: e.target.value }))}
                    disabled={user?.role === 'vendedor'}
                  />
                </FormField>

                <FormField label="Plazo de Crédito" className="col-span-2">
                  <Select
                    value={form.plazo_credito || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, plazo_credito: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin plazo —</SelectItem>
                      {PLAZO_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Ubicación sede central" className="col-span-2">
                  <Input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} />
                </FormField>

                <FormField label="Nota Cobranza" className="col-span-2">
                  <Textarea
                    rows={2}
                    value={form.nota_cobranza}
                    onChange={e => setForm(f => ({ ...f, nota_cobranza: e.target.value }))}
                  />
                </FormField>

                {/* Sedes de despacho */}
                <div className="col-span-2 border-t border-gray-200 dark:border-gray-800 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Sedes de despacho</label>
                    {editando && !sedeAdding && sedeEditId === null && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        leftIcon={<Plus />}
                        onClick={() => { setSedeAdding(true); setSedeForm(EMPTY_SEDE) }}
                      >
                        Agregar sede
                      </Button>
                    )}
                  </div>
                  {!editando && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Guarda la empresa primero para agregar sedes.</p>
                  )}
                  {editando && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                      {sedes.length === 0 && !sedeAdding && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">Sin sedes registradas</p>
                      )}
                      {sedes.map(s => (
                        <div key={s.id} className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          {sedeEditId === s.id ? (
                            <div className="space-y-1.5">
                              <Input
                                size="sm"
                                value={sedeForm.nombre}
                                onChange={e => setSedeForm(f => ({ ...f, nombre: e.target.value }))}
                                placeholder="Nombre"
                              />
                              <Input
                                size="sm"
                                value={sedeForm.direccion}
                                onChange={e => setSedeForm(f => ({ ...f, direccion: e.target.value }))}
                                placeholder="Dirección"
                              />
                              {sedeError && <p className="text-xs text-danger-600 dark:text-danger-400">{sedeError}</p>}
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="xs"
                                  onClick={guardarSede}
                                  loading={sedeSaving}
                                  disabled={!sedeForm.nombre || !sedeForm.direccion}
                                >
                                  Guardar
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => { setSedeEditId(null); setSedeForm(EMPTY_SEDE); setSedeError(null) }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.nombre}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{s.direccion}</span>
                              </div>
                              {sedeEliminandoId === s.id ? (
                                <div className="flex items-center gap-2">
                                  <Button type="button" size="xs" variant="danger" loading={sedeSaving} onClick={() => eliminarSede(s.id)}>Sí</Button>
                                  <Button type="button" size="xs" variant="ghost" onClick={() => setSedeEliminandoId(null)}>No</Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Editar sede"
                                    onClick={() => { setSedeEditId(s.id); setSedeForm({ nombre: s.nombre, direccion: s.direccion }); setSedeError(null); setSedeEliminandoId(null) }}
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Eliminar sede"
                                    className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                                    onClick={() => setSedeEliminandoId(s.id)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {sedeAdding && (
                        <div className="px-3 py-2 space-y-1.5 border-t border-gray-100 dark:border-gray-800">
                          <Input
                            size="sm"
                            value={sedeForm.nombre}
                            onChange={e => setSedeForm(f => ({ ...f, nombre: e.target.value }))}
                            placeholder="Nombre de la sede"
                          />
                          <Input
                            size="sm"
                            value={sedeForm.direccion}
                            onChange={e => setSedeForm(f => ({ ...f, direccion: e.target.value }))}
                            placeholder="Dirección completa"
                          />
                          {sedeError && <p className="text-xs text-danger-600 dark:text-danger-400">{sedeError}</p>}
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="xs"
                              onClick={guardarSede}
                              loading={sedeSaving}
                              disabled={!sedeForm.nombre || !sedeForm.direccion}
                            >
                              Guardar
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => { setSedeAdding(false); setSedeForm(EMPTY_SEDE); setSedeError(null) }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {error && <p className="col-span-2 text-sm text-danger-600 dark:text-danger-400">{error}</p>}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={cerrarModal}>Cancelar</Button>
              <Button type="submit" loading={guardar.isPending}>
                Guardar
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  )
}
