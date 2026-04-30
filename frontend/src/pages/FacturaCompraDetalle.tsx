import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, Send, FileText, ArrowLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import DteBadge from '../components/DteBadge'
import type { FacturaCompra, Proveedor } from '../types'
import {
  Button, Card, CardContent, FormField, Input, Textarea, Skeleton,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
} from '../components/ui'

interface LineaLocal {
  id?: number
  descripcion: string
  cantidad: string
  valor_neto: string
}

const today = () => new Date().toISOString().slice(0, 10)

export default function FacturaCompraDetalle() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'nueva'

  const [fc, setFc] = useState<FacturaCompra | null>(null)
  const [loading, setLoading] = useState(!isNew)

  const [proveedorId, setProveedorId] = useState('')
  const [fecha, setFecha] = useState(today())
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaLocal[]>([
    { descripcion: '', cantidad: '1', valor_neto: '0' },
  ])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emitirOpen, setEmitirOpen] = useState(false)
  const [emitiendo, setEmitiendo] = useState(false)

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get<Proveedor[]>('/api/proveedores/').then(r => r.data),
  })

  useEffect(() => {
    if (isNew) return
    api.get<FacturaCompra>(`/api/facturas-compra/${id}`)
      .then(r => {
        const data = r.data
        setFc(data)
        setProveedorId(data.proveedor_id ? String(data.proveedor_id) : '')
        setFecha(data.fecha)
        setNota(data.nota ?? '')
        setLineas(data.lineas.map(l => ({
          id: l.id,
          descripcion: l.descripcion,
          cantidad: String(l.cantidad),
          valor_neto: String(l.valor_neto),
        })))
      })
      .catch(() => setError('No se pudo cargar la factura de compra.'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const isLocked = fc ? ['pendiente', 'procesando', 'aceptada'].includes(fc.dte_estado) : false

  function addLinea() {
    setLineas([...lineas, { descripcion: '', cantidad: '1', valor_neto: '0' }])
  }

  function updateLinea(i: number, field: keyof LineaLocal, value: string) {
    setLineas(lineas.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function removeLinea(i: number) {
    if (lineas.length === 1) return
    setLineas(lineas.filter((_, idx) => idx !== i))
  }

  function buildBody() {
    return {
      proveedor_id: proveedorId ? Number(proveedorId) : null,
      fecha,
      nota: nota || null,
      lineas: lineas.map((l, i) => ({
        orden: i,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        valor_neto: Number(l.valor_neto),
      })),
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isNew) {
        const r = await api.post<FacturaCompra>('/api/facturas-compra/', buildBody())
        toast.success('Factura de compra creada')
        navigate(`/facturas-compra/${r.data.id}`)
      } else {
        const r = await api.put<FacturaCompra>(`/api/facturas-compra/${id}`, buildBody())
        setFc(r.data)
        toast.success('Guardado')
      }
    } catch {
      setError('Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleEmitir() {
    setEmitiendo(true)
    try {
      await api.post(`/api/facturas-compra/${id}/emitir`)
      setEmitirOpen(false)
      const r = await api.get<FacturaCompra>(`/api/facturas-compra/${id}`)
      setFc(r.data)
      toast.success('Solicitud DTE enviada')
    } catch {
      toast.error('Error al emitir.')
    } finally {
      setEmitiendo(false)
    }
  }

  function openPdf() {
    window.open(`/api/facturas-compra/${id}/pdf`, '_blank')
  }

  const totalNeto = lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.valor_neto), 0)
  const totalIva = Math.round(totalNeto * 0.19)
  const total = totalNeto + totalIva
  const fmt = (v: number) => `$${v.toLocaleString('es-CL')}`

  if (loading) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate('/facturas-compra')}
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {isNew ? 'Nueva Factura de Compra' : `FC-${String(fc?.numero ?? '').padStart(5, '0')}`}
        </h1>
        {fc && <DteBadge estado={fc.dte_estado} />}
        {fc && fc.dte_estado === 'no_emitida' && (
          <Button size="sm" leftIcon={<Send className="size-4" />} onClick={() => setEmitirOpen(true)}>
            Emitir DTE
          </Button>
        )}
        {!isNew && (
          <Button size="sm" variant="outline" leftIcon={<FileText className="size-4" />} onClick={openPdf}>
            PDF
          </Button>
        )}
      </div>

      {isLocked && (
        <div className="px-4 py-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-md text-sm text-warning-800 dark:text-warning-200">
          Documento bloqueado — DTE en proceso o ya aceptado.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Proveedor" htmlFor="proveedor_id">
                <select
                  id="proveedor_id"
                  value={proveedorId}
                  onChange={e => setProveedorId(e.target.value)}
                  disabled={isLocked}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.nombre}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Fecha" htmlFor="fecha">
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  disabled={isLocked}
                />
              </FormField>
            </div>
            <FormField label="Nota" htmlFor="nota">
              <Textarea
                id="nota"
                value={nota}
                onChange={e => setNota(e.target.value)}
                disabled={isLocked}
                rows={2}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Líneas</span>
              {!isLocked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  leftIcon={<Plus className="size-3.5" />}
                  onClick={addLinea}
                >
                  Agregar
                </Button>
              )}
            </div>

            <Table density="compact">
              <THead>
                <TR>
                  <TH>Descripción</TH>
                  <TH className="text-right w-20">Cant.</TH>
                  <TH className="text-right w-28">P. Neto</TH>
                  <TH className="text-right w-28">Total Neto</TH>
                  {!isLocked && <TH className="w-10" />}
                </TR>
              </THead>
              <TBody>
                {lineas.map((l, i) => (
                  <TR key={i}>
                    <TD>
                      {isLocked ? (
                        l.descripcion
                      ) : (
                        <Input
                          size="sm"
                          value={l.descripcion}
                          onChange={e => updateLinea(i, 'descripcion', e.target.value)}
                          placeholder="Descripción"
                          required
                        />
                      )}
                    </TD>
                    <TD className="text-right">
                      {isLocked ? (
                        <span className="font-num">{l.cantidad}</span>
                      ) : (
                        <Input
                          size="sm"
                          type="number"
                          min="1"
                          value={l.cantidad}
                          onChange={e => updateLinea(i, 'cantidad', e.target.value)}
                          className="text-right font-num w-20"
                        />
                      )}
                    </TD>
                    <TD className="text-right">
                      {isLocked ? (
                        <span className="font-num">${Number(l.valor_neto).toLocaleString('es-CL')}</span>
                      ) : (
                        <Input
                          size="sm"
                          type="number"
                          min="0"
                          value={l.valor_neto}
                          onChange={e => updateLinea(i, 'valor_neto', e.target.value)}
                          className="text-right font-num w-28"
                        />
                      )}
                    </TD>
                    <TD className="text-right font-num">
                      {fmt(Number(l.cantidad) * Number(l.valor_neto))}
                    </TD>
                    {!isLocked && (
                      <TD>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeLinea(i)}
                          aria-label="Eliminar línea"
                          className="text-gray-400 hover:text-danger-500"
                          disabled={lineas.length === 1}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="flex justify-end">
              <table className="text-sm w-64">
                <tbody>
                  <tr>
                    <td className="pr-8 text-gray-500 dark:text-gray-400 py-1">Neto</td>
                    <td className="text-right font-num text-gray-900 dark:text-gray-100">{fmt(totalNeto)}</td>
                  </tr>
                  <tr>
                    <td className="pr-8 text-gray-500 dark:text-gray-400 py-1">IVA (19%)</td>
                    <td className="text-right font-num text-gray-900 dark:text-gray-100">{fmt(totalIva)}</td>
                  </tr>
                  <tr className="border-t border-gray-200 dark:border-gray-700">
                    <td className="pr-8 font-semibold text-gray-900 dark:text-gray-100 pt-2">Total</td>
                    <td className="text-right font-bold font-num text-brand-600 dark:text-brand-400 pt-2">{fmt(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>}

        {!isLocked && (
          <Button type="submit" loading={saving} className="w-full" size="lg">
            {saving ? 'Guardando...' : isNew ? 'Crear Factura de Compra' : 'Guardar cambios'}
          </Button>
        )}
      </form>

      {fc && (
        <Modal open={emitirOpen} onOpenChange={setEmitirOpen}>
          <ModalContent size="sm">
            <ModalHeader>
              <ModalTitle>¿Emitir Factura de Compra DTE tipo 46?</ModalTitle>
              <ModalDescription>Total: <span className="font-num">{fmt(Number(fc.total))}</span></ModalDescription>
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Se enviará al SII via Lioren. Esta acción no se puede deshacer.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" onClick={() => setEmitirOpen(false)} disabled={emitiendo}>
                Cancelar
              </Button>
              <Button onClick={handleEmitir} loading={emitiendo}>
                {emitiendo ? 'Enviando...' : 'Confirmar'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}
