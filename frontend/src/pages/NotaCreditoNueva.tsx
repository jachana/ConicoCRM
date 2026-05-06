import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { getGuiaDespacho } from '../api/guiasDespacho'
import {
  Button, Card, CardContent, FormField, Input, Textarea,
} from '../components/ui'

interface Linea { descripcion: string; cantidad: string; precio_unitario: string }

export default function NotaCreditoNueva() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const guiaIdParam = searchParams.get('guia_despacho_id')
  const [clienteId, setClienteId] = useState('')
  const [razon, setRazon] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [lineas, setLineas] = useState<Linea[]>([{ descripcion: '', cantidad: '1', precio_unitario: '0' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [guiaDespachoId, setGuiaDespachoId] = useState<number | null>(null)
  const [guiaNumero, setGuiaNumero] = useState<number | null>(null)

  useEffect(() => {
    if (!guiaIdParam) return
    const id = Number(guiaIdParam)
    setGuiaDespachoId(id)
    getGuiaDespacho(id)
      .then(guia => {
        if (guia.cliente_id) setClienteId(String(guia.cliente_id))
        setRazon(`Anulación guía despacho N°${guia.numero}`)
        setGuiaNumero(guia.numero)
        if (guia.lineas && guia.lineas.length > 0) {
          setLineas(guia.lineas.map(l => ({
            descripcion: l.descripcion,
            cantidad: String(l.cantidad),
            precio_unitario: String(l.precio_unitario),
          })))
        }
      })
      .catch(() => setError(`No se pudo cargar la guía ${id}`))
  }, [guiaIdParam])

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
        ...(guiaDespachoId ? { guia_despacho_id: guiaDespachoId } : {}),
        lineas: lineas.map((l, i) => ({
          orden: i,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          precio_unitario: Number(l.precio_unitario),
        })),
      }
      const r = await api.post<{ id: number }>('/api/dte/notas-credito/', body)
      toast.success(`Nota de crédito creada`)
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
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Nueva Nota de Crédito</h1>

      {guiaNumero !== null && (
        <div className="flex items-start gap-3 p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-md text-sm text-warning-800 dark:text-warning-200">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>Esta NC anulará la guía N°{guiaNumero} cuando sea aceptada por SII.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="ID Cliente" htmlFor="cliente_id" required>
            <Input
              id="cliente_id"
              type="number"
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Fecha" htmlFor="fecha">
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Razón" htmlFor="razon" required>
          <Textarea
            id="razon"
            value={razon}
            onChange={e => setRazon(e.target.value)}
            required
            rows={2}
          />
        </FormField>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Líneas</span>
            <Button type="button" variant="ghost" size="xs" leftIcon={<Plus className="size-3.5" />} onClick={addLinea}>
              Agregar
            </Button>
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_120px_36px] gap-2">
                <Input
                  placeholder="Descripción"
                  value={l.descripcion}
                  onChange={e => updateLinea(i, 'descripcion', e.target.value)}
                  required
                />
                <Input
                  type="number"
                  placeholder="Cant."
                  value={l.cantidad}
                  onChange={e => updateLinea(i, 'cantidad', e.target.value)}
                  min="0.01"
                  step="0.01"
                />
                <Input
                  type="number"
                  placeholder="P. Unit."
                  value={l.precio_unitario}
                  onChange={e => updateLinea(i, 'precio_unitario', e.target.value)}
                  min="0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeLinea(i)}
                  aria-label="Eliminar línea"
                  className="text-gray-500 dark:text-gray-400 hover:text-danger-500"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-1 text-sm">
            <Row label="Neto" value={`$${subtotal.toLocaleString('es-CL')}`} />
            <Row label="IVA 19%" value={`$${iva.toLocaleString('es-CL')}`} />
            <div className="flex justify-between font-semibold pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-gray-700 dark:text-gray-300">Total</span>
              <span className="text-gray-900 dark:text-gray-100 font-num">${(subtotal + iva).toLocaleString('es-CL')}</span>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>}

        <Button type="submit" loading={saving} className="w-full" size="lg">
          {saving ? 'Guardando...' : 'Crear Nota de Crédito'}
        </Button>
      </form>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-700 dark:text-gray-200 font-num">{value}</span>
    </div>
  )
}
