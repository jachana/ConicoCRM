import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearBoleta, BoletaTipoDte, BoletaMetodoPago, BoletaCreatePayload } from '../api/boletas'

// TODO(W1-04): integrar autocomplete de productos (Task 15/16) en lugar del input plano de descripción.
// TODO(W1-04): integrar ClienteSelectModal en lugar del input numérico de cliente_id.

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

export default function BoletaNueva() {
  const navigate = useNavigate()
  const [tipoDte, setTipoDte] = useState<BoletaTipoDte>('39')
  const [receptorMode, setReceptorMode] = useState<ReceptorMode>('anonimo')
  const [clienteId, setClienteId] = useState('')
  const [nombreReceptor, setNombreReceptor] = useState('')
  const [rutReceptor, setRutReceptor] = useState('')
  const [patente, setPatente] = useState('')
  const [emailEnvio, setEmailEnvio] = useState('')
  const [metodoPago, setMetodoPago] = useState<BoletaMetodoPago>('efectivo')
  const [montoPagado, setMontoPagado] = useState('')
  const [lineas, setLineas] = useState<LineaUI[]>([emptyLinea()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // tipo 41 fuerza exenta=true en todas las líneas existentes
  useEffect(() => {
    if (tipoDte === '41') {
      setLineas(ls => ls.map(l => (l.exenta ? l : { ...l, exenta: true })))
    }
  }, [tipoDte])

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

  const pillBase = 'px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition'
  const pillOn = 'bg-brand-500 text-gray-900'
  const pillOff = 'bg-[#0B1120] text-gray-400 border border-white/10 hover:text-white'
  const inputCls = 'w-full px-4 py-2.5 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500/60'
  const lblCls = 'block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase'

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-white mb-6">Nueva Boleta</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipoDte('39')} className={`${pillBase} ${tipoDte === '39' ? pillOn : pillOff}`}>39 Afecta</button>
          <button type="button" onClick={() => setTipoDte('41')} className={`${pillBase} ${tipoDte === '41' ? pillOn : pillOff}`}>41 Exenta</button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setReceptorMode('anonimo')} className={`${pillBase} ${receptorMode === 'anonimo' ? pillOn : pillOff}`}>Anónimo</button>
          <button type="button" onClick={() => setReceptorMode('cliente')} className={`${pillBase} ${receptorMode === 'cliente' ? pillOn : pillOff}`}>Cliente registrado</button>
        </div>

        {receptorMode === 'cliente' ? (
          <div>
            <label className={lblCls}>ID Cliente</label>
            <input type="number" value={clienteId} onChange={e => setClienteId(e.target.value)} placeholder="ID Cliente" className={inputCls} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lblCls}>Nombre receptor</label>
              <input value={nombreReceptor} onChange={e => setNombreReceptor(e.target.value)} placeholder="nombre" className={inputCls} />
            </div>
            <div>
              <label className={lblCls}>RUT receptor</label>
              <input value={rutReceptor} onChange={e => setRutReceptor(e.target.value)} placeholder="rut" className={inputCls} />
            </div>
            <div>
              <label className={lblCls}>Patente vehículo</label>
              <input value={patente} onChange={e => setPatente(e.target.value)} placeholder="patente" className={inputCls} />
            </div>
            <div>
              <label className={lblCls}>Email envío</label>
              <input type="email" value={emailEnvio} onChange={e => setEmailEnvio(e.target.value)} placeholder="email" className={inputCls} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lblCls}>Método de pago</label>
            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as BoletaMetodoPago)} className={inputCls}>
              <option value="efectivo">Efectivo</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className={lblCls}>Monto pagado (opcional)</label>
            <input type="number" value={montoPagado} onChange={e => setMontoPagado(e.target.value)} placeholder="monto pagado" className={inputCls} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold text-gray-500 tracking-widest uppercase">Líneas</label>
            <button type="button" onClick={addLinea} className="text-xs text-brand-400 hover:text-brand-300">+ Agregar línea</button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_110px_70px_60px_32px] gap-2 items-center">
                <input placeholder="descripción" value={l.descripcion} onChange={e => updateLinea(i, { descripcion: e.target.value })} className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <input type="number" placeholder="cantidad" value={l.cantidad} onChange={e => updateLinea(i, { cantidad: e.target.value })} min="0.01" step="0.01" className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <input type="number" placeholder="precio" value={l.precio_unitario} onChange={e => updateLinea(i, { precio_unitario: e.target.value })} min="0" className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <input type="number" placeholder="desc%" value={l.descuento_pct} onChange={e => updateLinea(i, { descuento_pct: e.target.value })} min="0" max="100" className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <label className="flex items-center justify-center" title={tipoDte === '41' ? 'Tipo 41 fuerza exenta' : 'Marcar línea exenta'}>
                  <input type="checkbox" checked={l.exenta || tipoDte === '41'} disabled={tipoDte === '41'} onChange={e => updateLinea(i, { exenta: e.target.checked })} />
                </label>
                <button type="button" onClick={() => removeLinea(i)} className="text-gray-600 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111827] border border-white/8 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between text-gray-500"><span>Neto</span><span>${totales.neto.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between text-gray-500"><span>IVA</span><span>${totales.iva.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between font-semibold text-white"><span>Total</span><span>${totales.total.toLocaleString('es-CL')}</span></div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={!canSubmit} className="flex-1 py-3 bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold text-sm rounded-xl disabled:opacity-50">
            {saving ? 'Emitiendo...' : 'Emitir'}
          </button>
          <button type="button" onClick={() => navigate('/boletas')} className="px-6 py-3 text-sm text-gray-400 hover:text-white">Cancelar</button>
        </div>
      </form>
    </div>
  )
}
