import { useState, useEffect, useRef } from 'react'
import { Pencil, Save, X, ChevronDown, Plus, Trash2, Loader2, LayoutDashboard } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../stores/auth'
import { useEffectivePermissions } from '../hooks/useEffectivePermissions'
import { useDashboardPresets } from '../hooks/useDashboardPresets'
import WidgetGrid from '../components/dashboard/WidgetGrid'
import WidgetPicker from '../components/dashboard/WidgetPicker'
import WidgetConfigModal from '../components/dashboard/WidgetConfig'
import { TEMPLATES, applyTemplate } from '../components/dashboard/widgetCatalog'
import type { WidgetConfig } from '../types/dashboard'
import Widget from '../components/dashboard/Widget'
import { Button, EmptyState, Popover, PopoverTrigger, PopoverContent } from '../components/ui'
import { cn } from '../lib/cn'

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const { role: effectiveRole } = useEffectivePermissions()
  const role = effectiveRole ?? user?.role ?? 'vendedor'
  const isAdmin = role === 'admin'

  const { query, create, save, remove } = useDashboardPresets(role)
  const presets = query.data ?? []

  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editWidgets, setEditWidgets] = useState<WidgetConfig[]>([])
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (presets.length > 0 && activeSlot === null) {
      setActiveSlot(presets[0].slot)
    }
  }, [presets, activeSlot])

  const currentPreset = presets.find(p => p.slot === activeSlot) ?? presets[0] ?? null
  const viewWidgets: WidgetConfig[] = currentPreset?.layout.widgets ?? []

  function enterEdit() {
    if (!currentPreset) return
    setEditName(currentPreset.name)
    setEditWidgets([...currentPreset.layout.widgets])
    setEditMode(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditName('')
    setEditWidgets([])
    setShowTemplates(false)
  }

  async function saveEdit() {
    if (!currentPreset) return
    try {
      await save.mutateAsync({
        slot: currentPreset.slot,
        name: editName.trim() || currentPreset.name,
        layout: { widgets: editWidgets },
      })
      setEditMode(false)
      setEditName('')
      setEditWidgets([])
      toast.success('Dashboard guardado')
    } catch {
      toast.error('Error al guardar')
    }
  }

  async function handleCreatePreset() {
    try {
      const res = await create.mutateAsync({ name: `Dashboard ${presets.length + 1}` })
      setActiveSlot(res.slot)
      setEditName(res.name)
      setEditWidgets([])
      setEditMode(true)
      setTimeout(() => nameInputRef.current?.select(), 50)
    } catch {
      toast.error('Error al crear dashboard')
    }
  }

  async function handleDeletePreset() {
    if (!currentPreset || presets.length <= 1) return
    try {
      await remove.mutateAsync(currentPreset.slot)
      const remaining = presets.filter(p => p.slot !== currentPreset.slot)
      setActiveSlot(remaining[0]?.slot ?? null)
      cancelEdit()
    } catch {
      toast.error('Error al eliminar dashboard')
    }
  }

  function applyTempl(templateName: string) {
    const tmpl = TEMPLATES.find(t => t.name === templateName)
    if (!tmpl) return
    setEditWidgets(applyTemplate(tmpl, isAdmin))
    setShowTemplates(false)
  }

  const activeWidgets = editMode ? editWidgets : viewWidgets
  const sortedMobile = [...activeWidgets].sort((a, b) => a.grid.y - b.grid.y || a.grid.x - b.grid.x)

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 gap-2 bg-white dark:bg-gray-900">
        <h1 className="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAdmin && !editMode && !isMobile && (
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Pencil />}
              onClick={enterEdit}
              disabled={!currentPreset}
            >
              Editar
            </Button>
          )}
          {editMode && (
            <>
              <Popover open={showTemplates} onOpenChange={setShowTemplates}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" rightIcon={<ChevronDown />}>Templates</Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-1">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.name}
                      onClick={() => applyTempl(t.name)}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                    >
                      {t.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="outline" leftIcon={<X />} onClick={cancelEdit}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="success"
                leftIcon={<Save />}
                loading={save.isPending}
                onClick={saveEdit}
              >
                {save.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 md:px-6 py-2 border-b border-gray-200 dark:border-gray-800 overflow-x-auto flex-shrink-0 bg-gray-50/40 dark:bg-gray-900/40">
        {presets.map(p => {
          const isActive = p.slot === currentPreset?.slot
          const isEditingThis = editMode && isActive
          return (
            <button
              key={p.slot}
              onClick={() => { if (!editMode) setActiveSlot(p.slot) }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0',
                isActive
                  ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                editMode && !isActive && 'opacity-40 cursor-not-allowed'
              )}
            >
              {isEditingThis ? (
                <input
                  ref={nameInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="bg-transparent border-b border-brand-400 focus:outline-none w-28 min-w-0"
                  maxLength={50}
                  placeholder="Nombre…"
                />
              ) : (
                p.name
              )}
            </button>
          )
        })}

        {isAdmin && !editMode && presets.length < 5 && !isMobile && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Plus />}
            onClick={handleCreatePreset}
            disabled={create.isPending}
          >
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        )}

        {isAdmin && editMode && presets.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 />}
            onClick={handleDeletePreset}
            disabled={remove.isPending}
            className="text-danger-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10"
          >
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-3 md:p-4">
          {activeWidgets.length === 0 ? (
            <EmptyState
              icon={<LayoutDashboard />}
              title={isAdmin ? (editMode ? 'Agrega tu primer widget' : 'Dashboard vacío') : 'Sin widgets configurados'}
              description={
                isAdmin
                  ? editMode
                    ? 'Selecciona widgets desde el panel derecho para empezar a construir tu vista.'
                    : 'Hacé clic en "Editar" para configurar tu dashboard.'
                  : 'El dashboard aún no tiene widgets configurados.'
              }
              action={
                isAdmin && !editMode && currentPreset ? (
                  <Button leftIcon={<Pencil />} onClick={enterEdit}>Editar dashboard</Button>
                ) : null
              }
            />
          ) : isMobile ? (
            <div className="flex flex-col gap-3">
              {sortedMobile.map(w => (
                <div key={w.id} style={{ height: `${w.grid.h * 60}px`, maxHeight: '240px', minHeight: '120px' }}>
                  <Widget widget={w} editMode={false} onConfigure={() => {}} onRemove={() => {}} />
                </div>
              ))}
            </div>
          ) : (
            <WidgetGrid
              widgets={activeWidgets}
              editMode={editMode}
              onLayoutChange={setEditWidgets}
              onConfigure={setConfiguringId}
              onRemove={(id) => setEditWidgets(prev => prev.filter(w => w.id !== id))}
            />
          )}
        </div>

        {editMode && !isMobile && (
          <WidgetPicker
            isAdmin={isAdmin}
            onAdd={w => setEditWidgets(prev => [...prev, w])}
          />
        )}
      </div>

      {/* Config modal */}
      {configuringId && (() => {
        const w = editWidgets.find(x => x.id === configuringId)
        if (!w) return null
        return (
          <WidgetConfigModal
            widget={w}
            onSave={updated => setEditWidgets(prev => prev.map(x => x.id === updated.id ? updated : x))}
            onClose={() => setConfiguringId(null)}
          />
        )
      })()}
    </div>
  )
}
