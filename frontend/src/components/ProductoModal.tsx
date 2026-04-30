import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import type { Producto, Marca, TipoProducto } from '../types'
import ProductoDocumentos from './ProductoDocumentos'
import ProductoHistorial from './ProductoHistorial'
import ProductoHistorialCostos from './ProductoHistorialCostos'
import {
  Modal, ModalContent, ModalHeader, ModalTitle,
  Button, Input, Textarea, FormField, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from './ui'

type FormData = {
  nombre: string
  descripcion: string
  precio_venta: string
  margen: string
  stock_minimo: string
  proveedor_id: string
  marca_id: string
  volumen: string
  tipos: number[]
}

const EMPTY_FORM: FormData = {
  nombre: '', descripcion: '', precio_venta: '0',
  margen: '0', stock_minimo: '0', proveedor_id: '', marca_id: '', volumen: '',
  tipos: [],
}

function calcMargen(costo: number, venta: string): string {
  const v = parseFloat(venta)
  if (!v || v <= 0 || costo <= 0) return '0'
  return (((v - costo) / v) * 100).toFixed(2)
}

function formatPrecio(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }

interface Props {
  editando: Producto | null
  onClose: () => void
  userRole: string
}

export default function ProductoModal({ editando, onClose, userRole }: Props) {
  const qc = useQueryClient()
  const isAdmin = userRole === 'admin'
  const [form, setForm] = useState<FormData>(() => {
    if (!editando) return EMPTY_FORM
    return {
      nombre: editando.nombre,
      descripcion: editando.descripcion ?? '',
      precio_venta: String(editando.precio_venta),
      margen: calcMargen(Number(editando.precio_costo ?? 0), String(editando.precio_venta)),
      stock_minimo: String(editando.stock_minimo),
      proveedor_id: editando.proveedor_id ? String(editando.proveedor_id) : '',
      marca_id: editando.marca_id ? String(editando.marca_id) : '',
      volumen: editando.volumen !== null ? String(editando.volumen) : '',
      tipos: (editando.tipos ?? []).map(t => t.id),
    }
  })
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [formDirty, setFormDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: marcas = [] } = useQuery<Marca[]>({
    queryKey: ['marcas'],
    queryFn: () => api.get('/api/marcas/').then(r => r.data),
  })

  const { data: tipos = [] } = useQuery<TipoProducto[]>({
    queryKey: ['tipos-producto'],
    queryFn: () => api.get('/api/tipos-producto/').then(r => r.data),
  })

  const tipoNombrePorId = useMemo(() => {
    const m = new Map<number, string>()
    for (const t of tipos) m.set(t.id, t.nombre)
    return m
  }, [tipos])

  const crearTipo = useMutation({
    mutationFn: (nombre: string) =>
      api.post('/api/tipos-producto/', { nombre }).then(r => r.data as TipoProducto),
    onSuccess: (nuevo) => {
      qc.invalidateQueries({ queryKey: ['tipos-producto'] })
      setForm(f => f.tipos.includes(nuevo.id) ? f : { ...f, tipos: [...f.tipos, nuevo.id] })
      setNuevoTipo('')
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al crear tipo'),
  })

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        precio_venta: parseFloat(data.precio_venta) || 0,
        stock_minimo: parseInt(data.stock_minimo) || 0,
        proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id) : null,
        marca_id: data.marca_id ? parseInt(data.marca_id) : null,
        volumen: data.volumen ? parseFloat(data.volumen) : null,
        tipos: data.tipos,
      }
      if (editando) return api.patch(`/api/productos/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/productos/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); onClose() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  function toggleTipo(id: number) {
    setFormDirty(true)
    setForm(f => f.tipos.includes(id)
      ? { ...f, tipos: f.tipos.filter(t => t !== id) }
      : { ...f, tipos: [...f.tipos, id] }
    )
  }

  function handleCrearTipo() {
    const nombre = nuevoTipo.trim().toLowerCase()
    if (!nombre) return
    const ya = tipos.find(t => t.nombre === nombre)
    if (ya) {
      if (!form.tipos.includes(ya.id)) toggleTipo(ya.id)
      setNuevoTipo('')
      return
    }
    crearTipo.mutate(nombre)
  }

  const venta = parseFloat(form.precio_venta)
  const costo = Number(editando?.precio_costo ?? 0)
  const priceError = formDirty && venta <= costo ? 'El precio de venta debe ser mayor al costo' : null

  const formNode = (
    <form
      onSubmit={e => { e.preventDefault(); setFormDirty(true); if (priceError) return; guardar.mutate(form) }}
      className="grid grid-cols-2 gap-3"
    >
      <FormField label="Nombre" required className="col-span-2">
        <Input
          required
          value={form.nombre}
          onChange={e => { setFormDirty(true); setForm(f => ({ ...f, nombre: e.target.value })) }}
        />
      </FormField>

      <FormField label="Descripción" className="col-span-2">
        <Textarea
          rows={2}
          value={form.descripcion}
          onChange={e => { setFormDirty(true); setForm(f => ({ ...f, descripcion: e.target.value })) }}
        />
      </FormField>

      <FormField label="Marca">
        <Select
          value={form.marca_id || 'none'}
          onValueChange={v => { setFormDirty(true); setForm(f => ({ ...f, marca_id: v === 'none' ? '' : v })) }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin marca</SelectItem>
            {marcas.filter(m => m.activa).map(m => (
              <SelectItem key={m.id} value={String(m.id)}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Volumen (L)">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Ej: 4.5"
          value={form.volumen}
          onChange={e => { setFormDirty(true); setForm(f => ({ ...f, volumen: e.target.value })) }}
        />
      </FormField>

      <FormField label="Tipos" className="col-span-2" hint={isAdmin ? 'Multi-selección. Admins pueden crear nuevos tipos.' : 'Multi-selección.'}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tipos.length === 0 && (
            <span className="text-xs text-gray-400">Sin tipos disponibles</span>
          )}
          {tipos.map(t => {
            const sel = form.tipos.includes(t.id)
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggleTipo(t.id)}
                className="focus:outline-none"
                aria-pressed={sel}
              >
                <Badge variant={sel ? 'brand' : 'outline'}>
                  {t.nombre}
                </Badge>
              </button>
            )
          })}
        </div>
        {form.tipos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tipos.map(id => (
              <Badge key={id} variant="brand">
                {tipoNombrePorId.get(id) ?? `#${id}`}
                <button type="button" onClick={() => toggleTipo(id)} aria-label={`Quitar ${tipoNombrePorId.get(id) ?? id}`}>
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-2">
            <Input
              placeholder="Nuevo tipo (ej: hidraulico)"
              value={nuevoTipo}
              onChange={e => setNuevoTipo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCrearTipo()
                }
              }}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCrearTipo}
              disabled={!nuevoTipo.trim() || crearTipo.isPending}
            >
              Agregar
            </Button>
          </div>
        )}
      </FormField>

      <FormField
        label="Precio venta ($)"
        error={priceError}
        hint={editando ? `+IVA: ${formatPrecio(venta * 1.19)}` : undefined}
      >
        <Input
          type="number"
          min="0"
          step="0.01"
          tone={priceError ? 'error' : 'default'}
          value={form.precio_venta}
          onChange={e => {
            setFormDirty(true)
            const v = e.target.value
            setForm(f => ({ ...f, precio_venta: v, margen: calcMargen(costo, v) }))
          }}
        />
      </FormField>

      {isAdmin && (
        <>
          <FormField
            label="Precio costo ($) (auto)"
            hint={editando ? `+IVA: ${formatPrecio(Number(editando.costo_con_iva ?? 0))}` : undefined}
          >
            <Input
              readOnly
              value={editando ? formatPrecio(Number(editando.precio_costo ?? 0)) : '—'}
              className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
          </FormField>

          <FormField label="Margen (%)">
            <Input
              type="number"
              min="0"
              max="99"
              step="0.01"
              value={form.margen}
              onChange={e => {
                setFormDirty(true)
                const m = parseFloat(e.target.value)
                setForm(f => {
                  if (!isNaN(m) && m > 0 && m < 100 && costo > 0) {
                    return { ...f, margen: e.target.value, precio_venta: (costo / (1 - m / 100)).toFixed(2) }
                  }
                  return { ...f, margen: e.target.value }
                })
              }}
            />
          </FormField>

          <div className="col-span-2">
            {editando?.precio_costo_actualizado_en ? (
              <p className={`text-sm ${editando.costo_desactualizado ? 'text-danger-600 dark:text-danger-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                Costo actualizado: {new Date(editando.precio_costo_actualizado_en).toLocaleDateString('es-CL')}
                {editando.costo_desactualizado && ' — ⚠ desactualizado'}
              </p>
            ) : (
              <p className="text-sm text-danger-600 dark:text-danger-400 font-semibold">Costo nunca actualizado desde una lista</p>
            )}
          </div>
        </>
      )}

      <FormField label="Stock mínimo">
        <Input
          type="number"
          min="0"
          value={form.stock_minimo}
          onChange={e => { setFormDirty(true); setForm(f => ({ ...f, stock_minimo: e.target.value })) }}
        />
      </FormField>

      {error && (
        <div className="col-span-2 text-sm text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="col-span-2 flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={guardar.isPending}>Guardar</Button>
      </div>
    </form>
  )

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="xl" className="max-h-[92vh] flex flex-col">
        <ModalHeader>
          <ModalTitle>{editando ? 'Editar producto' : 'Nuevo producto'}</ModalTitle>
        </ModalHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editando ? (
            <Tabs defaultValue="datos">
              <TabsList variant="underline">
                <TabsTrigger value="datos">Datos</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
                {isAdmin && <TabsTrigger value="historial_costos">Historial costos</TabsTrigger>}
              </TabsList>
              <TabsContent value="datos" className="mt-4">{formNode}</TabsContent>
              <TabsContent value="documentos" className="mt-4">
                <ProductoDocumentos productoId={editando.id} />
              </TabsContent>
              <TabsContent value="historial" className="mt-4">
                <ProductoHistorial productoId={editando.id} />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="historial_costos" className="mt-4">
                  <ProductoHistorialCostos productoId={editando.id} />
                </TabsContent>
              )}
            </Tabs>
          ) : formNode}
        </div>
      </ModalContent>
    </Modal>
  )
}
