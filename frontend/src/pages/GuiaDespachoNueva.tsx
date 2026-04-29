import { useEffect, useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Plus, Save } from 'lucide-react'
import {
  crearGuiaDespacho,
  MOTIVOS_TRASLADO,
  type GuiaCreatePayload,
  type GuiaLineaInput,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import { getNotaVenta } from '../api/notasVenta'
import { api } from '../lib/api'
import ClienteSelectModal from '../components/ClienteSelectModal'
import type { Cliente } from '../types'
import {
  Button, Input, FormField, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

interface LineaForm {
  descripcion: string
  cantidad: string
  precio_unitario: string
  descuento_pct: string
  exenta: boolean
}

const emptyLinea: LineaForm = {
  descripcion: '',
  cantidad: '1',
  precio_unitario: '0',
  descuento_pct: '0',
  exenta: false,
}

export default function GuiaDespachoNueva() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nvIdParam = searchParams.get('nv_id')

  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [empresaId, setEmpresaId] = useState<number>(0)
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [motivo, setMotivo] = useState<MotivoTraslado>(1)
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...emptyLinea }])
  const [notaVentaId, setNotaVentaId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  useEffect(() => {
    if (!nvIdParam) return
    const id = Number(nvIdParam)
    setNotaVentaId(id)
    getNotaVenta(id)
      .then(nv => {
        if (nv.cliente_id) {
          setClienteId(nv.cliente_id)
          setClienteNombre(nv.cliente?.nombre ?? `Cliente ${nv.cliente_id}`)
        }
        if (nv.empresa_id) setEmpresaId(nv.empresa_id)
        if (nv.cliente?.direccion_despacho) setDireccion(nv.cliente.direccion_despacho)
        if (nv.cliente?.comuna) setComuna(nv.cliente.comuna)
        if (nv.lineas && nv.lineas.length > 0) {
          setLineas(nv.lineas.map(l => ({
            descripcion: l.descripcion,
            cantidad: String(l.cantidad),
            precio_unitario: String(l.valor_neto),
            descuento_pct: '0',
            exenta: false,
          })))
        }
      })
      .catch(() => setError(`No se pudo cargar la NV ${id}`))
  }, [nvIdParam])

  function addLinea() {
    setLineas(prev => [...prev, { ...emptyLinea }])
  }

  function removeLinea(i: number) {
    setLineas(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLinea(i: number, patch: Partial<LineaForm>) {
    setLineas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function handleClienteSelect(cliente: Cliente) {
    setClienteId(cliente.id)
    setClienteNombre(cliente.nombre)
    if (cliente.empresa_id && cliente.empresa_id !== empresaId) {
      setEmpresaId(cliente.empresa_id)
    }
    if (cliente.direccion_despacho) setDireccion(cliente.direccion_despacho)
    if (cliente.comuna) setComuna(cliente.comuna)
  }

  const lineasValidas =
    lineas.length > 0 &&
    lineas.every(
      l =>
        l.descripcion.trim() !== '' &&
        Number(l.cantidad) > 0 &&
        Number(l.precio_unitario) >= 0,
    )
  const formValido =
    clienteId !== null &&
    direccion.trim().length >= 3 &&
    comuna.trim() !== '' &&
    lineasValidas

  const subtotal = lineas.reduce((acc, l) => {
    const cant = Number(l.cantidad) || 0
    const prec = Number(l.precio_unitario) || 0
    const desc = Number(l.descuento_pct) || 0
    const base = cant * prec * (1 - desc / 100)
    return acc + (l.exenta ? 0 : base / 1.19)
  }, 0)
  const exentas = lineas.reduce((acc, l) => {
    if (!l.exenta) return acc
    const cant = Number(l.cantidad) || 0
    const prec = Number(l.precio_unitario) || 0
    const desc = Number(l.descuento_pct) || 0
    return acc + cant * prec * (1 - desc / 100)
  }, 0)
  const iva = Math.round(subtotal * 0.19)
  const total = Math.round(subtotal + iva + exentas)

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!formValido || saving) return
    setSaving(true)
    setError('')
    try {
      const payload: GuiaCreatePayload = {
        cliente_id: clienteId!,
        ...(empresaId ? { empresa_id: empresaId } : {}),
        motivo_traslado: motivo,
        direccion_destino: direccion.trim(),
        comuna_destino: comuna.trim(),
        ...(emailEnvio ? { email_envio: emailEnvio } : {}),
        ...(notaVentaId ? { nota_venta_id: notaVentaId } : {}),
        lineas: lineas.map(
          (l, i): GuiaLineaInput => ({
            orden: i,
            descripcion: l.descripcion.trim(),
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            ...(Number(l.descuento_pct) > 0 ? { descuento_pct: l.descuento_pct } : {}),
            exenta: l.exenta,
          }),
        ),
      }
      const guia = await crearGuiaDespacho(payload)
      navigate(`/guias-despacho/${guia.id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e?.response?.data?.detail || 'Error al guardar la guía')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault()
        handleSubmit()
      } else if (ev.key === 'Escape') {
        navigate('/guias-despacho')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, motivo, direccion, comuna, emailEnvio, lineas, saving])

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Nueva Guía de Despacho
      </h1>

      {notaVentaId && (
        <div className="mb-4 px-4 py-3 bg-info-50 dark:bg-info-500/10 border border-info-200 dark:border-info-800 rounded-lg text-sm text-info-700 dark:text-info-300 font-num">
          Cargado desde NV N°{notaVentaId}. Edita lo que necesites.
        </div>
      )}

      <form onSubmit={e => handleSubmit(e)} className="space-y-6">
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Receptor
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Empresa" htmlFor="empresa-select">
                <Select
                  value={empresaId === 0 ? 'none' : String(empresaId)}
                  onValueChange={v => {
                    setEmpresaId(v === 'none' ? 0 : Number(v))
                    setClienteId(null)
                    setClienteNombre('')
                  }}
                >
                  <SelectTrigger id="empresa-select" className="min-w-[200px]">
                    <SelectValue placeholder="— Seleccionar empresa —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seleccionar empresa —</SelectItem>
                    {empresas.map(emp => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowClienteModal(true)}
                disabled={!empresaId}
              >
                {clienteNombre ? `Cliente: ${clienteNombre}` : 'Seleccionar cliente'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FormField label="Motivo de traslado SII" htmlFor="motivo">
                <Select
                  value={String(motivo)}
                  onValueChange={v => setMotivo(Number(v) as MotivoTraslado)}
                >
                  <SelectTrigger id="motivo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_TRASLADO.map(m => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Dirección destino" htmlFor="direccion-destino">
              <Input
                id="direccion-destino"
                type="text"
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                maxLength={255}
              />
            </FormField>
            <FormField label="Comuna" htmlFor="comuna-destino">
              <Input
                id="comuna-destino"
                type="text"
                value={comuna}
                onChange={e => setComuna(e.target.value)}
                maxLength={100}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Email envío (opcional)" htmlFor="email-envio">
                <Input
                  id="email-envio"
                  type="email"
                  value={emailEnvio}
                  onChange={e => setEmailEnvio(e.target.value)}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h2>
              <Button
                type="button"
                size="xs"
                variant="outline"
                leftIcon={<Plus />}
                onClick={addLinea}
              >
                Línea
              </Button>
            </div>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    size="sm"
                    className="col-span-5"
                    placeholder="Descripción"
                    value={l.descripcion}
                    onChange={e => updateLinea(i, { descripcion: e.target.value })}
                  />
                  <Input
                    size="sm"
                    className="col-span-2"
                    placeholder="Cantidad"
                    type="number"
                    step="0.01"
                    value={l.cantidad}
                    onChange={e => updateLinea(i, { cantidad: e.target.value })}
                  />
                  <Input
                    size="sm"
                    className="col-span-2"
                    placeholder="Precio unit"
                    type="number"
                    step="1"
                    value={l.precio_unitario}
                    onChange={e => updateLinea(i, { precio_unitario: e.target.value })}
                  />
                  <Input
                    size="sm"
                    className="col-span-1"
                    placeholder="Desc%"
                    type="number"
                    step="0.01"
                    value={l.descuento_pct}
                    onChange={e => updateLinea(i, { descuento_pct: e.target.value })}
                  />
                  <label className="col-span-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 accent-brand-500"
                      checked={l.exenta}
                      onChange={e => updateLinea(i, { exenta: e.target.checked })}
                    />{' '}
                    Ex
                  </label>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeLinea(i)}
                    disabled={lineas.length === 1}
                    aria-label="Eliminar línea"
                    className="col-span-1 text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right text-sm space-y-0.5 text-gray-700 dark:text-gray-300 font-num">
              <div>Neto: $ {Math.round(subtotal).toLocaleString('es-CL')}</div>
              <div>IVA 19%: $ {iva.toLocaleString('es-CL')}</div>
              {exentas > 0 && (
                <div>Exento: $ {Math.round(exentas).toLocaleString('es-CL')}</div>
              )}
              <div className="font-semibold text-gray-900 dark:text-white">
                Total: $ {total.toLocaleString('es-CL')}
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="px-4 py-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/guias-despacho')}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            leftIcon={<Save />}
            disabled={!formValido || saving}
            loading={saving}
          >
            Guardar guía
          </Button>
        </div>
      </form>

      {showClienteModal && (
        <ClienteSelectModal
          open={showClienteModal}
          empresaId={empresaId}
          empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
          onClose={() => setShowClienteModal(false)}
          onSelect={(cliente: Cliente) => {
            handleClienteSelect(cliente)
            setShowClienteModal(false)
          }}
        />
      )}
    </div>
  )
}
