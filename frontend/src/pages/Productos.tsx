import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileSpreadsheet, Inbox, Pencil, Trash2, Tag, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Producto } from '../types'
import ProductoModal from '../components/ProductoModal'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import {
  Button, Input, FormField, EmptyState, Skeleton, Tooltip,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Card,
} from '../components/ui'

function formatPrecio(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

function roundCLP(n: number): number {
  return Math.round(n)
}

export default function Productos() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole, permissions } = useEffectivePermissions()
  const isVendedor = (effectiveRole ?? user?.role) === 'vendedor'
  const canEdit = !!permissions?.catalogo?.edit
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Producto | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [overrides, setOverrides] = useState<Record<number, string>>({}) // id -> precio nuevo (string para input)
  const [adjustPct, setAdjustPct] = useState('')
  const [adjustAbs, setAdjustAbs] = useState('')
  const [confirmSave, setConfirmSave] = useState(false)

  function abrirCrear() { setEditando(null); setModalOpen(true) }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true) }
  function cerrarModal() { setModalOpen(false); setEditando(null) }

  function toggleBulk() {
    setBulkMode(v => !v)
    setSelected(new Set())
    setOverrides({})
    setAdjustPct('')
    setAdjustAbs('')
  }

  function toggleSelected(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(productos.map(p => p.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function setOverride(id: number, value: string) {
    setOverrides(prev => ({ ...prev, [id]: value }))
  }

  function applyAdjustment() {
    if (selected.size === 0) {
      toast.error('Selecciona al menos un producto')
      return
    }
    const pct = parseFloat(adjustPct)
    const abs = parseFloat(adjustAbs)
    const hasPct = !Number.isNaN(pct) && adjustPct.trim() !== ''
    const hasAbs = !Number.isNaN(abs) && adjustAbs.trim() !== ''
    if (!hasPct && !hasAbs) {
      toast.error('Ingresa un porcentaje o un valor absoluto')
      return
    }
    const next: Record<number, string> = { ...overrides }
    productos.forEach(p => {
      if (!selected.has(p.id)) return
      const actual = Number(p.precio_venta) || 0
      let nuevo = actual
      if (hasAbs) nuevo = abs
      if (hasPct) nuevo = nuevo * (1 + pct / 100)
      next[p.id] = String(roundCLP(nuevo))
    })
    setOverrides(next)
  }

  // Cambios efectivos: solo filas con override válido > 0 que difiera del precio actual
  const cambios = useMemo(() => {
    const out: { id: number; nombre: string; actual: number; nuevo: number }[] = []
    for (const p of productos) {
      const ov = overrides[p.id]
      if (ov === undefined || ov === '') continue
      const nuevo = parseFloat(ov)
      if (Number.isNaN(nuevo) || nuevo <= 0) continue
      const actual = Number(p.precio_venta) || 0
      if (roundCLP(nuevo) === roundCLP(actual)) continue
      out.push({ id: p.id, nombre: p.nombre, actual, nuevo: roundCLP(nuevo) })
    }
    return out
  }, [productos, overrides])

  const tieneInvalidos = useMemo(() => {
    for (const id of Object.keys(overrides)) {
      const ov = overrides[Number(id)]
      if (ov === undefined || ov === '') continue
      const n = parseFloat(ov)
      if (Number.isNaN(n) || n <= 0) return true
    }
    return false
  }, [overrides])

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/productos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      setConfirmDelete(null)
      setDeleteError(null)
      toast.success('Producto eliminado')
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  const guardarBulk = useMutation({
    mutationFn: () =>
      api.patch('/api/productos/bulk-precios', {
        items: cambios.map(c => ({ id: c.id, precio_venta: c.nuevo })),
      }).then(r => r.data),
    onSuccess: (data: { actualizados: number }) => {
      toast.success(`${data.actualizados} producto(s) actualizado(s)`)
      qc.invalidateQueries({ queryKey: ['productos'] })
      setConfirmSave(false)
      setBulkMode(false)
      setSelected(new Set())
      setOverrides({})
      setAdjustPct('')
      setAdjustAbs('')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.detail ?? 'Error al guardar precios')
    },
  })

  async function exportarExcel() {
    const r = await api.get('/api/productos/export/excel', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'catalogo.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Catálogo de productos</h1>
        <div className="flex gap-2">
          {canEdit && (
            <Button
              variant={bulkMode ? 'primary' : 'outline'}
              leftIcon={bulkMode ? <X size={16} /> : <Tag size={16} />}
              onClick={toggleBulk}
            >
              {bulkMode ? 'Salir edición masiva' : 'Edición masiva'}
            </Button>
          )}
          {!bulkMode && (
            <>
              <Button variant="outline" leftIcon={<FileSpreadsheet size={16} />} onClick={exportarExcel}>
                Exportar Excel
              </Button>
              <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>
                Agregar producto
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 max-w-sm">
        <FormField>
          <Input
            type="text"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            leftAddon={<Search />}
          />
        </FormField>
      </div>

      {bulkMode && (
        <Card padded className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{selected.size}</span> seleccionado(s)
              {' · '}
              <button type="button" className="text-primary-600 hover:underline" onClick={selectAll}>
                Seleccionar todos
              </button>
              {' · '}
              <button type="button" className="text-gray-500 hover:underline" onClick={clearSelection}>
                Limpiar
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2 ml-auto">
              <FormField label="Ajuste %" className="w-28">
                <Input
                  type="number"
                  placeholder="±10"
                  value={adjustPct}
                  onChange={e => setAdjustPct(e.target.value)}
                />
              </FormField>
              <FormField label="Precio absoluto $" className="w-36">
                <Input
                  type="number"
                  placeholder="0"
                  value={adjustAbs}
                  onChange={e => setAdjustAbs(e.target.value)}
                />
              </FormField>
              <Button variant="outline" onClick={applyAdjustment}>
                Aplicar a selección
              </Button>
              <Button
                disabled={cambios.length === 0 || tieneInvalidos || guardarBulk.isPending}
                leftIcon={<Check size={16} />}
                onClick={() => setConfirmSave(true)}
              >
                Guardar {cambios.length > 0 ? `(${cambios.length})` : ''}
              </Button>
            </div>
          </div>
          {tieneInvalidos && (
            <p className="mt-2 text-xs text-danger-600 dark:text-danger-400">
              Hay precios inválidos en la tabla (deben ser mayores a 0).
            </p>
          )}
        </Card>
      )}

      {isLoading ? (
        <Card padded>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </Card>
      ) : productos.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox />}
            title="Sin productos registrados"
            description="Agrega tu primer producto para empezar"
            action={<Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Agregar producto</Button>}
          />
        </Card>
      ) : (
        <Card>
          <Table density="compact">
            <THead>
              <TR>
                {bulkMode && (
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={selected.size > 0 && selected.size === productos.length}
                      onChange={() => (selected.size === productos.length ? clearSelection() : selectAll())}
                    />
                  </TH>
                )}
                <TH>Nombre</TH>
                <TH>Marca</TH>
                {!isVendedor && <TH className="text-right">Precio costo</TH>}
                <TH className="text-right">Precio venta</TH>
                {bulkMode && <TH className="text-right w-32">Precio nuevo</TH>}
                {!bulkMode && <TH className="text-right">Stock</TH>}
                {!bulkMode && <TH className="text-right">Mín.</TH>}
                {!bulkMode && <TH className="w-24" />}
              </TR>
            </THead>
            <TBody>
              {productos.map(p => {
                const stockBajo = p.stock_actual < p.stock_minimo
                const isSelected = selected.has(p.id)
                const ov = overrides[p.id]
                const ovNum = ov === undefined || ov === '' ? null : parseFloat(ov)
                const ovInvalido = ovNum !== null && (Number.isNaN(ovNum) || ovNum <= 0)
                const cambia = ovNum !== null && !ovInvalido && roundCLP(ovNum) !== roundCLP(Number(p.precio_venta) || 0)
                return (
                  <TR key={p.id}>
                    {bulkMode && (
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${p.nombre}`}
                          checked={isSelected}
                          onChange={() => toggleSelected(p.id)}
                        />
                      </TD>
                    )}
                    <TD>
                      <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                      {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</div>}
                    </TD>
                    <TD className="text-gray-500 dark:text-gray-400 text-xs">
                      {p.marca ? p.marca.nombre : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </TD>
                    {!isVendedor && <TD className="text-right text-gray-500 dark:text-gray-400 font-num">{formatPrecio(Number(p.precio_costo ?? 0))}</TD>}
                    <TD className={`text-right font-num ${cambia ? 'text-gray-400 line-through' : 'font-medium text-gray-900 dark:text-white'}`}>
                      {formatPrecio(Number(p.precio_venta))}
                    </TD>
                    {bulkMode && (
                      <TD className="text-right">
                        <Input
                          type="number"
                          value={ov ?? ''}
                          onChange={e => setOverride(p.id, e.target.value)}
                          placeholder={String(roundCLP(Number(p.precio_venta) || 0))}
                          className={`text-right font-num ${ovInvalido ? 'border-danger-500' : cambia ? 'border-success-500' : ''}`}
                        />
                      </TD>
                    )}
                    {!bulkMode && (
                      <>
                        <TD className={`text-right font-num ${stockBajo ? 'text-danger-600 dark:text-danger-400 font-semibold' : 'text-gray-900 dark:text-white font-medium'}`}>
                          {stockBajo ? (
                            <Tooltip label="Stock bajo mínimo">
                              <span className="inline-flex items-center gap-1">
                                {p.stock_actual}
                                <span className="text-danger-500 text-xs">⚠</span>
                              </span>
                            </Tooltip>
                          ) : (
                            p.stock_actual
                          )}
                        </TD>
                        <TD className="text-right text-gray-400 font-num">{p.stock_minimo}</TD>
                        <TD>
                          <div className="flex items-center gap-1">
                            <Tooltip label="Editar">
                              <Button size="icon-sm" variant="ghost" onClick={() => abrirEditar(p)}>
                                <Pencil size={14} />
                              </Button>
                            </Tooltip>
                            <Tooltip label="Eliminar">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-danger-500 hover:text-danger-600 hover:bg-danger-500/10"
                                onClick={() => { setConfirmDelete(p); setDeleteError(null) }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </Tooltip>
                          </div>
                        </TD>
                      </>
                    )}
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {modalOpen && (
        <ProductoModal
          editando={editando}
          onClose={cerrarModal}
          userRole={effectiveRole ?? user?.role ?? 'vendedor'}
        />
      )}

      <Modal open={!!confirmDelete} onOpenChange={open => { if (!open) { setConfirmDelete(null); setDeleteError(null) } }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Eliminar producto</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Eliminar <span className="font-medium text-gray-900 dark:text-white">{confirmDelete?.nombre}</span>? Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <p className="mt-3 text-xs text-danger-600 dark:text-danger-400">{deleteError}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(null); setDeleteError(null) }}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={eliminar.isPending}
              onClick={() => confirmDelete && eliminar.mutate(confirmDelete.id)}
            >
              {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={confirmSave} onOpenChange={open => { if (!open) setConfirmSave(false) }}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Confirmar cambios de precio</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Vas a actualizar <span className="font-medium text-gray-900 dark:text-white">{cambios.length}</span> producto(s). Los cambios son atómicos: si alguno falla, no se aplica ninguno.
            </p>
            <div className="max-h-80 overflow-y-auto border rounded border-gray-200 dark:border-gray-700">
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Producto</TH>
                    <TH className="text-right">Actual</TH>
                    <TH className="text-right">Nuevo</TH>
                    <TH className="text-right">Δ</TH>
                  </TR>
                </THead>
                <TBody>
                  {cambios.map(c => {
                    const delta = c.nuevo - c.actual
                    const pct = c.actual > 0 ? (delta / c.actual) * 100 : 0
                    return (
                      <TR key={c.id}>
                        <TD className="font-medium">{c.nombre}</TD>
                        <TD className="text-right text-gray-500 font-num">{formatPrecio(c.actual)}</TD>
                        <TD className="text-right font-num font-medium">{formatPrecio(c.nuevo)}</TD>
                        <TD className={`text-right font-num text-xs ${delta > 0 ? 'text-success-600 dark:text-success-400' : delta < 0 ? 'text-danger-600 dark:text-danger-400' : 'text-gray-400'}`}>
                          {delta >= 0 ? '+' : ''}{formatPrecio(delta)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setConfirmSave(false)} disabled={guardarBulk.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={guardarBulk.isPending || cambios.length === 0}
              onClick={() => guardarBulk.mutate()}
            >
              {guardarBulk.isPending ? 'Guardando…' : `Confirmar ${cambios.length} cambio(s)`}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
