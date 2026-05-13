import { useState, useCallback, useMemo } from 'react'
import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useRecentEntities, type RecentTipo } from '../../hooks/useRecentEntities'
import { useModulos } from '../../hooks/useModulos'
import { useAuthStore } from '../../stores/auth'
import { ACTIONS, isActionAllowed, matchesActionQuery, type ActionDef } from './actions'
import ActionItem from './items/ActionItem'
import ProductoItem from './items/ProductoItem'
import ClienteItem from './items/ClienteItem'
import EmpresaItem from './items/EmpresaItem'
import DocumentoItem from './items/DocumentoItem'
import EmpleadoItem from './items/EmpleadoItem'
import RecentesGroup from './RecentesGroup'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export const URL_BY_TIPO: Record<RecentTipo, (id: number) => string> = {
  producto:      id => `/catalogo?detalle=${id}`,
  cliente:       id => `/clientes?detalle=${id}`,
  empresa:       id => `/empresas?detalle=${id}`,
  cotizacion:    id => `/cotizaciones/${id}`,
  nota_venta:    id => `/notas-venta/${id}`,
  factura:       id => `/facturas/${id}`,
  orden_compra:  id => `/ordenes-compra/${id}`,
  empleado:      id => `/rrhh?detalle=${id}`,
}

export default function GlobalSearchModal({ open, onOpenChange }: Props) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { data, isFetching } = useGlobalSearch(q)
  const { recientes, push } = useRecentEntities()
  const role = useAuthStore(s => s.user?.role) ?? null
  const logout = useAuthStore(s => s.logout)
  const { effective: modulos, isLoading: modulosLoading } = useModulos()

  const visibleActions = useMemo(
    () =>
      ACTIONS.filter(a => isActionAllowed(a, role, modulos, modulosLoading))
        .filter(a => matchesActionQuery(a, q)),
    [role, modulos, modulosLoading, q]
  )

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) setQ('')
      onOpenChange(v)
    },
    [onOpenChange]
  )

  const handleSelect = useCallback(
    (entry: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => {
      push(entry)
      navigate(URL_BY_TIPO[entry.tipo](entry.id))
      handleClose(false)
    },
    [navigate, push, handleClose]
  )

  const handleActionSelect = useCallback(
    (action: ActionDef) => {
      handleClose(false)
      if (action.handler === 'logout') {
        logout()
        navigate('/login')
        return
      }
      if (action.route) navigate(action.route)
    },
    [navigate, logout, handleClose]
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleClose}
      label="Búsqueda global"
      shouldFilter={false}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => handleClose(false)}
    >
      <div
        className="w-[640px] max-w-[92vw] bg-white dark:bg-[#111827] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <DialogPrimitive.Title className="sr-only">Búsqueda global</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Busca productos, clientes, empresas y documentos
        </DialogPrimitive.Description>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-white/5">
          <Search size={18} className="text-gray-400" />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Buscar productos, clientes, documentos... o escribe 'nueva'"
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          {isFetching && <Loader2 size={16} className="text-gray-400 animate-spin" />}
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400">
          {visibleActions.length > 0 && (
            <Command.Group heading="Acciones">
              {visibleActions.map(a => (
                <ActionItem key={`action-${a.slug}`} action={a} onSelect={handleActionSelect} />
              ))}
            </Command.Group>
          )}
          {q.length < 2 && <RecentesGroup recientes={recientes} onSelect={handleSelect} />}
          {q.length >= 2 && (
            <>
              {data?.productos?.length ? (
                <Command.Group heading="Productos">
                  {data.productos.map(p => (
                    <ProductoItem key={`prod-${p.id}`} item={p} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.clientes?.length ? (
                <Command.Group heading="Clientes">
                  {data.clientes.map(c => (
                    <ClienteItem key={`cli-${c.id}`} item={c} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.empresas?.length ? (
                <Command.Group heading="Empresas">
                  {data.empresas.map(e => (
                    <EmpresaItem key={`emp-${e.id}`} item={e} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.cotizaciones?.length ? (
                <Command.Group heading="Cotizaciones">
                  {data.cotizaciones.map(d => (
                    <DocumentoItem key={`cot-${d.id}`} item={d} tipo="cotizacion" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.notas_venta?.length ? (
                <Command.Group heading="Notas de venta">
                  {data.notas_venta.map(d => (
                    <DocumentoItem key={`nv-${d.id}`} item={d} tipo="nota_venta" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.facturas?.length ? (
                <Command.Group heading="Facturas">
                  {data.facturas.map(d => (
                    <DocumentoItem key={`fac-${d.id}`} item={d} tipo="factura" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.ordenes_compra?.length ? (
                <Command.Group heading="Órdenes de compra">
                  {data.ordenes_compra.map(d => (
                    <DocumentoItem key={`oc-${d.id}`} item={d} tipo="orden_compra" onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              {data?.empleados?.length ? (
                <Command.Group heading="Empleados">
                  {data.empleados.map(e => (
                    <EmpleadoItem key={`empl-${e.id}`} item={e} onSelect={handleSelect} />
                  ))}
                </Command.Group>
              ) : null}
              <Command.Empty className="py-8 text-center text-sm text-gray-500">Sin resultados</Command.Empty>
            </>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
