import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { crearBoleta, BoletaTipoDte, BoletaMetodoPago, BoletaCreatePayload } from '../api/boletas'
import {
  Button, Input, FormField, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import { cn } from '../lib/cn'
import { api } from '../lib/api'
import type { Producto, Cliente } from '../types'
import ClienteSelectModal from '../components/ClienteSelectModal'

interface LineaUI {
  descripcion: string
  cantidad: string
  precio_unitario: string
  descuento_pct: string
  exenta: boolean
}

type ReceptorMode = 'anonimo' | 'cliente'

const emptyLinea = (): LineaUI => ({
  descripcion: '',
  cantidad: '1',
  precio_unitario: '0',
  descuento_pct: '0',
  exenta: false,
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function calcLinea(l: LineaUI, tipoDte: BoletaTipoDte) {
  const cantidad = Number(l.cantidad) || 0
  const precio = Number(l.precio_unitario) || 0
  const desc = Number(l.descuento_pct) || 0
  const bruto = precio * cantidad * (1 - desc / 100)
  const exenta = l.exenta || tipoDte === '41'
  if (exenta) {
    return { neto: round2(bruto), iva: 0, total: round2(bruto) }
  }
  const neto = round2(bruto / 1.19)
  const iva = round2(bruto - neto)
  return { neto, iva, total: round2(neto + iva) }
}

const segBase = 'px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-colors border'
const segOn = 'bg-brand-500 text-white border-brand-500'
const segOff = 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'

export default function BoletaNueva() {
  const navigate = useNavigate()
  const [tipoDte, setTipoDte] = useState<BoletaTipoDte>('39')
  const [receptorMode, setReceptorMode] = useState<ReceptorMode>('anonimo')
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [empresaId, setEmpresaId] = useState<number>(0)
  const [nombreReceptor, setNombreReceptor] = useState('')
  const [rutReceptor, setRutReceptor] = useState('')
  const [patente, setPatente] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [metodoPago, setMetodoPago] = useState<BoletaMetodoPago>('efectivo')
  const [montoPagado, setMontoPagado] = useState('')
  const [lineas, setLineas] = useState<LineaUI[]>([emptyLinea()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<Producto[]>([])

  const { data: empresas = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  // Auto-select default empresa when there is exactly one
  useEffect(() => {
    if (empresas.length === 1 && empresaId === 0) {
      setEmpresaId(empresas[0].id)
    }
  }, [empresas, empresaId])

  // tipo 41 fuerza exenta=true en todas las líneas existentes
  useEffect(() => {
    if (tipoDte === '41') {
      setLineas(ls => ls.map(l => (l.exenta ? l : { ...l, exenta: true })))
    }
  }, [tipoDte])

  const fetchAutocomplete = useCallback(async (q: string) => {
    try {
      if (q.trim() !== '') {
        const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
        setAutocompleteResults(res.data)
        return
      }
      setAutocompleteResults([])
    } catch {
      setAutocompleteResults([])
    }
  }, [])

  function handleDescripcionChange(idx: number, value: string) {
    setAutocompleteIdx(idx)
    fetchAutocomplete(value)
    updateLinea(idx, { descripcion: value })
  }

  function selectProducto(idx: number, producto: Producto) {
    updateLinea(idx, {
      descripcion: producto.nombre,
      precio_unitario: String(Number(producto.precio_venta)),
    })
    setAutocompleteIdx(null)
    setAutocompleteResults([])
  }

  function handleClienteSelect(cliente: Cliente) {
    setClienteId(String(cliente.id))
    setClienteNombre(cliente.nombre)
    setShowClienteModal(false)
    if (cliente.empresa_id) setEmpresaId(cliente.empresa_id)
  }

  function addLinea() {
    setLineas([...lineas, { ...emptyLinea(), exenta: tipoDte === '41' }])
  }

  function updateLinea(i: number, patch: Partial<LineaUI>) {
    setLineas(lineas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function removeLinea(i: number) {
    if (lineas.length === 1) return
    setLineas(lineas.filter((_, idx) => idx !== i))
  }

  const totales = lineas.reduce(
    (acc, l) => {
      const c = calcLinea(l, tipoDte)
      return { neto: acc.neto + c.neto, iva: acc.iva + c.iva, total: acc.total + c.total }
    },
    { neto: 0, iva: 0, total: 0 },
  )

  const lineasValidas = lineas.every(
    l => l.descripcion.trim().length > 0 && Number(l.cantidad) > 0 && Number(l.precio_unitario) >= 0,
  )
  const clienteOk = receptorMode === 'anonimo' || (receptorMode === 'cliente' && Number(clienteId) > 0)
  const canSubmit = !saving && lineasValidas && clienteOk

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const payload: BoletaCreatePayload = {
        tipo_dte: tipoDte,
        metodo_pago: metodoPago,
        ...(montoPagado ? { monto_pagado: montoPagado } : {}),
        ...(receptorMode === 'cliente'
          ? { cliente_id: Number(clienteId) }
          : {
              ...(nombreReceptor ? { nombre_receptor: nombreReceptor } : {}),
              ...(rutReceptor ? { rut_receptor: rutReceptor } : {}),
              ...(patente ? { patente_vehiculo: patente } : {}),
              ...(emailEnvio ? { email_envio: emailEnvio } : {}),
            }),
        lineas: lineas.map((l, i) => ({
          orden: i,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          ...(Number(l.descuento_pct) > 0 ? { descuento_pct: l.descuento_pct } : {}),
          exenta: l.exenta || tipoDte === '41',
        })),
      }
      const result = await crearBoleta(payload)
      navigate(`/boletas/${result.id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail || 'Error al emitir boleta')
    } finally {
      setSaving(false)
    }
  }

  // Atajos: Ctrl+Enter envía, Esc cancela
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault()
        handleSubmit()
      } else if (ev.key === 'Escape') {
        navigate('/boletas')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, tipoDte, receptorMode, clienteId, nombreReceptor, rutReceptor, patente, emailEnvio, metodoPago, montoPagado, saving])

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Nueva Boleta</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipoDte('39')} className={cn(segBase, tipoDte === '39' ? segOn : segOff)}>
            39 Afecta
          </button>
          <button type="button" onClick={() => setTipoDte('41')} className={cn(segBase, tipoDte === '41' ? segOn : segOff)}>
            41 Exenta
          </button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setReceptorMode('anonimo')} className={cn(segBase, receptorMode === 'anonimo' ? segOn : segOff)}>
            Anónimo
          </button>
          <button type="button" onClick={() => setReceptorMode('cliente')} className={cn(segBase, receptorMode === 'cliente' ? segOn : segOff)}>
            Cliente registrado
          </button>
        </div>

        {receptorMode === 'cliente' ? (
          <FormField label="Cliente">
            <button
              type="button"
              onClick={() => setShowClienteModal(true)}
              className="w-full text-left px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              {clienteNombre || <span className="text-gray-400">Seleccionar cliente...</span>}
            </button>
          </FormField>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Nombre receptor">
              <Input value={nombreReceptor} onChange={e => setNombreReceptor(e.target.value)} placeholder="Nombre" />
            </FormField>
            <FormField label="RUT receptor">
              <Input value={rutReceptor} onChange={e => setRutReceptor(e.target.value)} placeholder="RUT" />
            </FormField>
            <FormField label="Patente vehículo">
              <Input value={patente} onChange={e => setPatente(e.target.value)} placeholder="Patente" />
            </FormField>
            <FormField label="Email envío">
              <Input type="email" value={emailEnvio} onChange={e => setEmailEnvio(e.target.value)} placeholder="Email" />
            </FormField>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Método de pago">
            <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as BoletaMetodoPago)}>
              <SelectTrigger>
                <SelectValue placeholder="Método de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="debito">Débito</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Monto pagado (opcional)">
            <Input type="number" value={montoPagado} onChange={e => setMontoPagado(e.target.value)} placeholder="Monto pagado" />
          </FormField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Líneas</label>
            <Button type="button" size="xs" variant="ghost" leftIcon={<Plus />} onClick={addLinea}>
              Agregar línea
            </Button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_120px_80px_60px_36px] gap-2 items-center">
                <div className="relative">
                  <Input
                    size="sm"
                    placeholder="Descripción"
                    value={l.descripcion}
                    onChange={e => handleDescripcionChange(i, e.target.value)}
                    onBlur={() => setTimeout(() => { setAutocompleteIdx(null); setAutocompleteResults([]) }, 200)}
                  />
                  {autocompleteIdx === i && autocompleteResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                      {autocompleteResults.slice(0, 8).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => selectProducto(i, p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50 dark:hover:bg-brand-500/10 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                          <div className="text-gray-500 dark:text-gray-400">{p.sku ? `SKU: ${p.sku}` : ''} · ${Number(p.precio_venta).toLocaleString('es-CL')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input size="sm" type="number" placeholder="Cantidad" value={l.cantidad} onChange={e => updateLinea(i, { cantidad: e.target.value })} min="0.01" step="0.01" />
                <Input size="sm" type="number" placeholder="Precio" value={l.precio_unitario} onChange={e => updateLinea(i, { precio_unitario: e.target.value })} min="0" />
                <Input size="sm" type="number" placeholder="Desc %" value={l.descuento_pct} onChange={e => updateLinea(i, { descuento_pct: e.target.value })} min="0" max="100" />
                <label className="flex items-center justify-center" title={tipoDte === '41' ? 'Tipo 41 fuerza exenta' : 'Marcar línea exenta'}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 accent-brand-500"
                    checked={l.exenta || tipoDte === '41'}
                    disabled={tipoDte === '41'}
                    onChange={e => updateLinea(i, { exenta: e.target.checked })}
                  />
                </label>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                  onClick={() => removeLinea(i)}
                  aria-label="Eliminar línea"
                  disabled={lineas.length === 1}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-4 text-sm space-y-1">
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Neto</span>
              <span className="font-num">${totales.neto.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>IVA</span>
              <span className="font-num">${totales.iva.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-800 pt-2 mt-1">
              <span>Total</span>
              <span className="font-num">${totales.total.toLocaleString('es-CL')}</span>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" loading={saving} disabled={!canSubmit} fullWidth>
            {saving ? 'Emitiendo...' : 'Emitir'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/boletas')}>
            Cancelar
          </Button>
        </div>

        <ClienteSelectModal
          open={showClienteModal}
          empresaId={empresaId}
          empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
          onSelect={handleClienteSelect}
          onClose={() => setShowClienteModal(false)}
        />
      </form>
    </div>
  )
}
