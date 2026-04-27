import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import type { SystemConfig, BancoReceptor } from '../types'
import { usePreferencesStore } from '../stores/preferences'
import { patchPreferencias, type AtajoBusqueda } from '../api/preferencias'
import { atajoLabel } from '../components/search/SearchButton'
import {
  Button, Input, FormField, Card, Skeleton,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'

const COMPANY_FIELDS = [
  { key: 'empresa_nombre', label: 'Nombre empresa' },
  { key: 'empresa_rut', label: 'RUT empresa' },
  { key: 'empresa_direccion', label: 'Dirección' },
  { key: 'empresa_logo_url', label: 'URL del logo' },
]

const BANKING_FIELDS = [
  { key: 'empresa_banco', label: 'Banco' },
  { key: 'empresa_tipo_cuenta', label: 'Tipo de cuenta' },
  { key: 'empresa_numero_cuenta', label: 'N° de cuenta' },
  { key: 'empresa_nombre_titular', label: 'Nombre titular' },
]

export default function Configuracion() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  const { data: config = [], isLoading } = useQuery<SystemConfig[]>({
    queryKey: ['config'],
    queryFn: () => api.get('/api/config/').then(r => r.data),
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [nuevoBanco, setNuevoBanco] = useState('')

  const { data: bancos = [] } = useQuery<BancoReceptor[]>({
    queryKey: ['bancos-receptores'],
    queryFn: () => api.get('/api/bancos-receptores').then(r => r.data),
  })

  const addBanco = useMutation({
    mutationFn: (nombre: string) => api.post('/api/bancos-receptores', { nombre }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bancos-receptores'] }); setNuevoBanco('') },
    onError: () => toast.error('Error al agregar banco'),
  })

  const toggleBanco = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      api.patch(`/api/bancos-receptores/${id}`, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bancos-receptores'] }),
    onError: () => toast.error('Error al actualizar banco'),
  })

  useEffect(() => {
    if (config.length === 0) return
    const map = Object.fromEntries(config.map(c => [c.key, c.value]))
    setForm({
      empresa_nombre: map.empresa_nombre ?? '',
      empresa_rut: map.empresa_rut ?? '',
      empresa_direccion: map.empresa_direccion ?? '',
      empresa_logo_url: map.empresa_logo_url ?? '',
      empresa_banco: map.empresa_banco ?? '',
      empresa_tipo_cuenta: map.empresa_tipo_cuenta ?? '',
      empresa_numero_cuenta: map.empresa_numero_cuenta ?? '',
      empresa_nombre_titular: map.empresa_nombre_titular ?? '',
      dias_alerta_costo_desactualizado: map.dias_alerta_costo_desactualizado ?? '60',
    })
  }, [config])

  const saveMut = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      api.patch('/api/config/', { updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('Configuración guardada')
    },
    onError: () => toast.error('Error al guardar'),
  })

  function handleSave() {
    saveMut.mutate(form)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Configuración del Sistema</h1>

      <BusquedaSection />

      {isAdmin && isLoading ? (
        <div className="space-y-5">
          {[0, 1, 2].map(i => (
            <Card key={i} padded>
              <Skeleton className="h-4 w-40 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : isAdmin ? (
        <>
          <Card padded>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos de la Empresa</h2>
            <div className="grid grid-cols-1 gap-4">
              {COMPANY_FIELDS.map(f => (
                <FormField key={f.key} label={f.label}>
                  <Input
                    type="text"
                    value={form[f.key] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
          </Card>

          <Card padded>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Alertas de inventario</h2>
            <FormField
              label="Días para considerar un costo desactualizado"
              hint="Los productos cuyo costo no se haya actualizado en este número de días aparecerán marcados en rojo en Inventario y en el modal de producto."
            >
              <Input
                type="number"
                min={1}
                value={form.dias_alerta_costo_desactualizado ?? '60'}
                onChange={e => setForm(prev => ({ ...prev, dias_alerta_costo_desactualizado: e.target.value }))}
              />
            </FormField>
          </Card>

          <Card padded>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Datos Bancarios</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Aparecen en el PDF de cotizaciones como información para transferencias y cheques.</p>
            <div className="grid grid-cols-1 gap-4">
              {BANKING_FIELDS.map(f => (
                <FormField key={f.key} label={f.label}>
                  <Input
                    type="text"
                    value={form[f.key] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </div>

          <Card padded>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Bancos de recepción de pagos
            </h2>
            <div className="space-y-1 mb-4">
              {bancos.map(b => (
                <div key={b.id} className="flex items-center justify-between text-sm py-1">
                  <span className={b.activo ? 'text-gray-900 dark:text-gray-100' : 'line-through text-gray-400'}>
                    {b.nombre}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleBanco.mutate({ id: b.id, activo: !b.activo })}
                  >
                    {b.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              ))}
              {bancos.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Sin bancos configurados</p>}
            </div>
            <div className="flex gap-2 items-end">
              <FormField className="flex-1" label="Agregar banco">
                <Input
                  type="text"
                  value={nuevoBanco}
                  onChange={e => setNuevoBanco(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && nuevoBanco.trim() && addBanco.mutate(nuevoBanco.trim())}
                  placeholder="Nombre del banco"
                />
              </FormField>
              <Button
                onClick={() => nuevoBanco.trim() && addBanco.mutate(nuevoBanco.trim())}
                disabled={!nuevoBanco.trim() || addBanco.isPending}
                leftIcon={<Plus />}
              >
                Agregar
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function BusquedaSection() {
  const prefs = usePreferencesStore(s => s.preferencias)
  const setAll = usePreferencesStore(s => s.setAll)
  const [visible, setVisible] = useState(prefs.busqueda_boton_visible)
  const [atajo, setAtajo] = useState<AtajoBusqueda>(prefs.busqueda_atajo)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVisible(prefs.busqueda_boton_visible)
    setAtajo(prefs.busqueda_atajo)
  }, [prefs])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await patchPreferencias({ busqueda_boton_visible: visible, busqueda_atajo: atajo })
      setAll(updated)
      toast.success('Preferencias guardadas')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const opciones: AtajoBusqueda[] = ['ctrl_k', 'ctrl_p', 'ctrl_shift_f', 'alt_s']

  return (
    <Card padded>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Búsqueda</h2>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={visible}
            onChange={e => setVisible(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500"
          />
          Mostrar botón de búsqueda en barra superior
        </label>
        <FormField label="Atajo de teclado">
          <Select value={atajo} onValueChange={v => setAtajo(v as AtajoBusqueda)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opciones.map(o => (
                <SelectItem key={o} value={o}>
                  {atajoLabel(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </Card>
  )
}
