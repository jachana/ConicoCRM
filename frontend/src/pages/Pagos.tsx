import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Check, ExternalLink, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { Pago, Factura } from '../types'
import {
  Button, Input, FormField, Card, CardContent, EmptyState, Skeleton, Tooltip, Badge,
  Table, THead, TBody, TR, TH, TD,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

const METODOS_PAGO = ['efectivo', 'transferencia', 'cheque', 'debito', 'credito', 'deposito']

function fmtMoney(n: number | string | null | undefined) {
  return `$ ${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
}

export default function Pagos() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'subadmin'

  const [showModal, setShowModal] = useState(false)
  const [facturaId, setFacturaId] = useState<number | ''>('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { data: pagos = [], isLoading } = useQuery<Pago[]>({
    queryKey: ['pagos'],
    queryFn: () => api.get('/api/pagos/').then(r => r.data),
  })

  const { data: facturas = [] } = useQuery<Factura[]>({
    queryKey: ['facturas'],
    queryFn: () => api.get('/api/facturas/').then(r => r.data),
    enabled: showModal,
  })

  const facturasDisponibles = facturas.filter(f => f.estado !== 'anulada' && f.estado !== 'pagada')
  const facturaSeleccionada = facturaId ? facturas.find(f => f.id === facturaId) : null
  const saldo = facturaSeleccionada
    ? Number(facturaSeleccionada.total) - Number(facturaSeleccionada.monto_pagado ?? 0)
    : null

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/api/pagos/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setShowModal(false)
      resetModal()
      toast.success('Pago registrado correctamente')
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Error al registrar pago'),
  })

  const deleteMut = useMutation({
    mutationFn: (pagoId: number) => api.delete(`/api/pagos/${pagoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setConfirmId(null)
      toast.success('Abono eliminado')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar')
    },
  })

  function resetModal() {
    setFacturaId('')
    setFecha(new Date().toISOString().split('T')[0])
    setMonto('')
    setMetodo('transferencia')
    setNota('')
    setError('')
  }

  function openCreateModal() {
    resetModal()
    setShowModal(true)
  }

  const totalPagos = pagos.reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Pagos</h1>
          {pagos.length > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {pagos.length} abono{pagos.length !== 1 ? 's' : ''} · Total: {fmtMoney(totalPagos)}
            </p>
          )}
        </div>
        <Button leftIcon={<Plus />} onClick={openCreateModal}>
          Registrar abono
        </Button>
      </div>

      {/* Loading / empty / list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : pagos.length === 0 ? (
        <Card padded>
          <EmptyState
            icon={<Inbox />}
            title="Sin pagos registrados aún"
            description="Registra el primer abono para empezar."
            action={<Button onClick={openCreateModal}>Registrar primer abono</Button>}
          />
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {pagos.map(p => (
              <Card key={p.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => navigate(`/facturas/${p.factura_id}`)}
                          className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-500 flex items-center gap-1 font-num"
                        >
                          FAC-{String(p.factura?.numero ?? p.factura_id).padStart(5, '0')}
                          <ExternalLink size={11} />
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-num">{p.fecha}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900 dark:text-white font-num">{fmtMoney(p.monto)}</span>
                        <Badge variant="neutral" className="capitalize">{p.metodo_pago}</Badge>
                      </div>
                      {p.nota && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{p.nota}</p>}
                      {p.registrado_por && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">por {p.registrado_por.name}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <Tooltip label="Eliminar abono">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                          onClick={() => setConfirmId(p.id)}
                        >
                          <Trash2 />
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <Table density="compact">
                <THead>
                  <TR>
                    <TH>Factura</TH>
                    <TH>Fecha</TH>
                    <TH className="text-right">Monto</TH>
                    <TH>Método</TH>
                    <TH>Nota</TH>
                    <TH>Registrado por</TH>
                    {isAdmin && <TH className="w-12" />}
                  </TR>
                </THead>
                <TBody>
                  {pagos.map(p => (
                    <TR key={p.id}>
                      <TD>
                        <button
                          onClick={() => navigate(`/facturas/${p.factura_id}`)}
                          className="text-brand-600 dark:text-brand-400 hover:text-brand-500 font-medium flex items-center gap-1 font-num"
                        >
                          FAC-{String(p.factura?.numero ?? p.factura_id).padStart(5, '0')}
                          <ExternalLink size={11} />
                        </button>
                      </TD>
                      <TD className="text-gray-700 dark:text-gray-300 font-num">{p.fecha}</TD>
                      <TD className="text-right font-semibold text-gray-900 dark:text-white font-num">{fmtMoney(p.monto)}</TD>
                      <TD>
                        <Badge variant="neutral" className="capitalize">{p.metodo_pago}</Badge>
                      </TD>
                      <TD className="text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">{p.nota ?? '—'}</TD>
                      <TD className="text-gray-500 dark:text-gray-400 text-xs">{p.registrado_por?.name ?? '—'}</TD>
                      {isAdmin && (
                        <TD>
                          <Tooltip label="Eliminar abono">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
                              onClick={() => setConfirmId(p.id)}
                            >
                              <Trash2 />
                            </Button>
                          </Tooltip>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      )}

      {/* Create modal */}
      <Modal open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false) }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Registrar abono</ModalTitle>
          </ModalHeader>
          <ModalBody>
            {error && (
              <div className="mb-3 px-3 py-2 bg-danger-500/10 border border-danger-500/30 rounded-md text-xs text-danger-600 dark:text-danger-400">
                {error}
              </div>
            )}
            <div className="space-y-3">
              <FormField label="Factura">
                <Select
                  value={facturaId === '' ? 'none' : String(facturaId)}
                  onValueChange={v => setFacturaId(v === 'none' ? '' : Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar factura..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Seleccionar factura...</SelectItem>
                    {facturasDisponibles.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        FAC-{String(f.numero).padStart(5, '0')} · {f.cliente?.nombre} · {fmtMoney(f.total)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saldo !== null && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Saldo pendiente: <span className="font-medium text-warning-600 dark:text-warning-400 font-num">{fmtMoney(saldo)}</span>
                  </p>
                )}
              </FormField>
              <FormField label="Fecha">
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </FormField>
              <FormField label="Monto">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Método de pago">
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METODOS_PAGO.map(m => (
                      <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Nota (opcional)">
                <Input
                  type="text"
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  placeholder="Referencia, número de transferencia..."
                />
              </FormField>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              leftIcon={<Check />}
              loading={createMut.isPending}
              disabled={!facturaId || !monto}
              onClick={() => createMut.mutate({
                factura_id: Number(facturaId),
                fecha,
                monto: Number(monto),
                metodo_pago: metodo,
                nota: nota || null,
              })}
            >
              {createMut.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Confirm delete modal */}
      <Modal open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null) }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>¿Eliminar este abono?</ModalTitle>
            <ModalDescription>Esta acción no se puede deshacer.</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => confirmId !== null && deleteMut.mutate(confirmId)}
            >
              Eliminar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
