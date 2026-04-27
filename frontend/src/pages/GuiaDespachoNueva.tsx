import { useEffect, useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Plus, Save, Send } from 'lucide-react'
import {
  crearGuiaDespacho,
  emitirGuiaDespachoDte,
  MOTIVOS_TRASLADO,
  type GuiaCreatePayload,
  type GuiaLineaInput,
  type MotivoTraslado,
} from '../api/guiasDespacho'
import { getNotaVenta } from '../api/notasVenta'
import { api } from '../lib/api'
import ClienteSelectModal from '../components/ClienteSelectModal'
import type { Cliente } from '../types'

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
    // Sync empresa from client if it differs (rare but keep consistent)
    if (cliente.empresa_id && cliente.empresa_id !== empresaId) {
      setEmpresaId(cliente.empresa_id)
    }
    // Pre-fill address if available
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

  async function handleSubmit(emitir: boolean, e?: FormEvent) {
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
      if (emitir) {
        await emitirGuiaDespachoDte(guia.id)
      }
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
        handleSubmit(true)
      } else if (ev.key === 'Escape') {
        navigate('/guias-despacho')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, motivo, direccion, comuna, emailEnvio, lineas, saving])

  const inputCls =
    'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:border-brand-500'
  const lblCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Nueva Guía de Despacho
      </h1>

      {notaVentaId && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          Cargado desde NV N°{notaVentaId}. Edita lo que necesites.
        </div>
      )}

      <form onSubmit={e => handleSubmit(true, e)} className="space-y-6">
        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Receptor
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="empresa-select" className={lblCls}>
                Empresa
              </label>
              <select
                id="empresa-select"
                value={empresaId}
                onChange={e => {
                  setEmpresaId(Number(e.target.value))
                  setClienteId(null)
                  setClienteNombre('')
                }}
                className={inputCls + ' min-w-[180px]'}
              >
                <option value={0}>— Seleccionar empresa —</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <span className={lblCls}>&nbsp;</span>
              <button
                type="button"
                onClick={() => setShowClienteModal(true)}
                disabled={!empresaId}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {clienteNombre ? `Cliente: ${clienteNombre}` : 'Seleccionar cliente'}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="motivo" className={lblCls}>
              Motivo de traslado SII
            </label>
            <select
              id="motivo"
              value={motivo}
              onChange={e => setMotivo(Number(e.target.value) as MotivoTraslado)}
              className={inputCls}
            >
              {MOTIVOS_TRASLADO.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="direccion-destino" className={lblCls}>
              Dirección destino
            </label>
            <input
              id="direccion-destino"
              type="text"
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
              className={inputCls}
              maxLength={255}
            />
          </div>
          <div>
            <label htmlFor="comuna-destino" className={lblCls}>
              Comuna
            </label>
            <input
              id="comuna-destino"
              type="text"
              value={comuna}
              onChange={e => setComuna(e.target.value)}
              className={inputCls}
              maxLength={100}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="email-envio" className={lblCls}>
              Email envío (opcional)
            </label>
            <input
              id="email-envio"
              type="email"
              value={emailEnvio}
              onChange={e => setEmailEnvio(e.target.value)}
              className={inputCls}
            />
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas</h2>
            <button
              type="button"
              onClick={addLinea}
              className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <Plus size={12} /> Línea
            </button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className={`${inputCls} col-span-5`}
                  placeholder="Descripción"
                  value={l.descripcion}
                  onChange={e => updateLinea(i, { descripcion: e.target.value })}
                />
                <input
                  className={`${inputCls} col-span-2`}
                  placeholder="Cantidad"
                  type="number"
                  step="0.01"
                  value={l.cantidad}
                  onChange={e => updateLinea(i, { cantidad: e.target.value })}
                />
                <input
                  className={`${inputCls} col-span-2`}
                  placeholder="Precio unit"
                  type="number"
                  step="1"
                  value={l.precio_unitario}
                  onChange={e => updateLinea(i, { precio_unitario: e.target.value })}
                />
                <input
                  className={`${inputCls} col-span-1`}
                  placeholder="Desc%"
                  type="number"
                  step="0.01"
                  value={l.descuento_pct}
                  onChange={e => updateLinea(i, { descuento_pct: e.target.value })}
                />
                <label className="col-span-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={l.exenta}
                    onChange={e => updateLinea(i, { exenta: e.target.checked })}
                  />{' '}
                  Ex
                </label>
                <button
                  type="button"
                  onClick={() => removeLinea(i)}
                  disabled={lineas.length === 1}
                  className="col-span-1 p-1.5 text-gray-500 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right text-sm space-y-0.5 text-gray-700 dark:text-gray-300">
            <div>Neto: $ {Math.round(subtotal).toLocaleString('es-CL')}</div>
            <div>IVA 19%: $ {iva.toLocaleString('es-CL')}</div>
            {exentas > 0 && (
              <div>Exento: $ {Math.round(exentas).toLocaleString('es-CL')}</div>
            )}
            <div className="font-semibold text-gray-900 dark:text-white">
              Total: $ {total.toLocaleString('es-CL')}
            </div>
          </div>
        </section>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => navigate('/guias-despacho')}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={!formValido || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            <Save size={14} /> Guardar borrador
          </button>
          <button
            type="submit"
            disabled={!formValido || saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50"
          >
            <Send size={14} /> Guardar y emitir DTE
          </button>
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
