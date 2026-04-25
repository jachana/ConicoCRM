import { useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useRecentEntities, type RecentTipo } from '../../hooks/useRecentEntities'
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

const URL_BY_TIPO: Record<RecentTipo, (id: number) => string> = {
  producto:      () => '/catalogo',
  cliente:       () => '/clientes',
  empresa:       id => `/empresas/${id}`,
  cotizacion:    id => `/cotizaciones/${id}`,
  nota_venta:    id => `/notas-venta/${id}`,
  factura:       id => `/facturas/${id}`,
  orden_compra:  id => `/ordenes-compra/${id}`,
  empleado:      () => '/rrhh',
}

export default function GlobalSearchModal({ open, onOpenChange }: Props) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { data, isFetching } = useGlobalSearch(q)
  const { recientes, push } = useRecentEntities()

  const handleSelect = useCallback(
    (entry: { tipo: RecentTipo; id: number; titulo: string; subtitulo?: string; estado?: string }) => {
      push(entry)
      navigate(URL_BY_TIPO[entry.tipo](entry.id))
      onOpenChange(false)
      setQ('')
    },
    [navigate, push, onOpenChange]
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Búsqueda global"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
    >
      <div
        className="w-[640px] max-w-[92vw] bg-white dark:bg-[#111827] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-white/5">
          <Search size={18} className="text-gray-400" />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Buscar productos, clientes, documentos..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          {isFetching && <Loader2 size={16} className="text-gray-400 animate-spin" />}
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
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
