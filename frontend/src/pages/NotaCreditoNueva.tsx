import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

interface Linea { descripcion: string; cantidad: string; precio_unitario: string }

export default function NotaCreditoNueva() {
  const navigate = useNavigate()
  const [clienteId, setClienteId] = useState('')
  const [razon, setRazon] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [lineas, setLineas] = useState<Linea[]>([{ descripcion: '', cantidad: '1', precio_unitario: '0' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addLinea() {
    setLineas([...lineas, { descripcion: '', cantidad: '1', precio_unitario: '0' }])
  }

  function updateLinea(i: number, field: keyof Linea, value: string) {
    setLineas(lineas.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function removeLinea(i: number) {
    setLineas(lineas.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!clienteId) { setError('Ingrese ID de cliente'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        fecha,
        cliente_id: Number(clienteId),
        razon,
        lineas: lineas.map((l, i) => ({
          orden: i,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio_unitario),
        })),
      }
      const r = await api.post<{ id: number }>('/api/dte/notas-credito/', body)
      navigate(`/notas-credito/${r.data.id}`)
    } catch {
      setError('Error al crear la nota de crédito.')
    } finally {
      setSaving(false)
    }
  }

  const subtotal = lineas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.precio_unitario), 0)
  const iva = Math.round(subtotal * 0.19)

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-white mb-6">Nueva Nota de Crédito</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">ID Cliente</label>
            <input type="number" value={clienteId} onChange={e => setClienteId(e.target.value)} required
              className="w-full px-4 py-2.5 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500/60" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500/60" />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase">Razón</label>
          <textarea value={razon} onChange={e => setRazon(e.target.value)} required rows={2}
            className="w-full px-4 py-2.5 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500/60 resize-none" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold text-gray-500 tracking-widest uppercase">Líneas</label>
            <button type="button" onClick={addLinea} className="text-xs text-brand-400 hover:text-brand-300">+ Agregar</button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_120px_32px] gap-2">
                <input placeholder="Descripción" value={l.descripcion} onChange={e => updateLinea(i, 'descripcion', e.target.value)} required
                  className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <input type="number" placeholder="Cant." value={l.cantidad} onChange={e => updateLinea(i, 'cantidad', e.target.value)} min="0.01" step="0.01"
                  className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <input type="number" placeholder="P. Unit." value={l.precio_unitario} onChange={e => updateLinea(i, 'precio_unitario', e.target.value)} min="0"
                  className="px-3 py-2 bg-[#0B1120] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500/60" />
                <button type="button" onClick={() => removeLinea(i)} className="text-gray-600 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111827] border border-white/8 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between text-gray-500"><span>Neto</span><span>${subtotal.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between text-gray-500"><span>IVA 19%</span><span>${iva.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between font-semibold text-white"><span>Total</span><span>${(subtotal + iva).toLocaleString('es-CL')}</span></div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={saving}
          className="w-full py-3 bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold text-sm rounded-xl disabled:opacity-50">
          {saving ? 'Guardando...' : 'Crear Nota de Crédito'}
        </button>
      </form>
    </div>
  )
}
