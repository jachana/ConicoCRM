// frontend/src/pages/Dashboard.tsx
import { useState, useRef } from 'react'
import { Pencil, Save, X, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useDashboardLayout } from '../hooks/useDashboardLayout'
import WidgetGrid from '../components/dashboard/WidgetGrid'
import WidgetPicker from '../components/dashboard/WidgetPicker'
import WidgetConfigModal from '../components/dashboard/WidgetConfig'
import { TEMPLATES, applyTemplate } from '../components/dashboard/widgetCatalog'
import type { WidgetConfig } from '../types/dashboard'

export default function Dashboard() {
  const user = useAuthStore(s => s.user)
  const role = user?.role ?? 'vendedor'
  const isAdmin = role === 'admin'

  const { query, save } = useDashboardLayout(role)

  const [editMode, setEditMode] = useState(false)
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const savedWidgetsRef = useRef<WidgetConfig[]>([])

  const layoutWidgets: WidgetConfig[] = query.data?.layout.widgets ?? []

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function enterEdit() {
    savedWidgetsRef.current = [...layoutWidgets]
    setWidgets([...layoutWidgets])
    setEditMode(true)
  }

  function cancelEdit() {
    setWidgets([])
    setEditMode(false)
  }

  async function saveLayout() {
    await save.mutateAsync({ widgets })
    setEditMode(false)
    setWidgets([])
    showToast('Layout guardado')
  }

  function handleLayoutChange(updated: WidgetConfig[]) {
    setWidgets(updated)
  }

  function handleAdd(widget: WidgetConfig) {
    setWidgets(prev => [...prev, widget])
  }

  function handleRemove(id: string) {
    setWidgets(prev => prev.filter(w => w.id !== id))
  }

  function handleConfigure(id: string) {
    setConfiguringId(id)
  }

  function handleSaveConfig(updated: WidgetConfig) {
    setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w))
  }

  function applyTempl(templateName: string) {
    const tmpl = TEMPLATES.find(t => t.name === templateName)
    if (!tmpl) return
    setWidgets(applyTemplate(tmpl, isAdmin))
    setShowTemplates(false)
  }

  const activeWidgets = editMode ? widgets : layoutWidgets

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Cargando dashboard…</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-2">
          {isAdmin && !editMode && (
            <button
              onClick={enterEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
            >
              <Pencil size={13} /> Editar dashboard
            </button>
          )}
          {editMode && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Templates <ChevronDown size={12} />
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-20 min-w-[140px]">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.name}
                        onClick={() => applyTempl(t.name)}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <X size={13} /> Cancelar
              </button>
              <button
                onClick={saveLayout}
                disabled={save.isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
              >
                <Save size={13} /> {save.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-sm text-white z-50 ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {activeWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
              <p className="text-sm">{isAdmin ? 'No hay widgets. Hacé clic en "Editar dashboard" para agregar.' : 'El dashboard aún no tiene widgets configurados.'}</p>
            </div>
          ) : (
            <WidgetGrid
              widgets={activeWidgets}
              editMode={editMode}
              onLayoutChange={handleLayoutChange}
              onConfigure={handleConfigure}
              onRemove={handleRemove}
            />
          )}
        </div>

        {editMode && (
          <WidgetPicker isAdmin={isAdmin} onAdd={handleAdd} />
        )}
      </div>

      {/* Config modal */}
      {configuringId && (() => {
        const w = widgets.find(x => x.id === configuringId)
        if (!w) return null
        return (
          <WidgetConfigModal
            widget={w}
            onSave={handleSaveConfig}
            onClose={() => setConfiguringId(null)}
          />
        )
      })()}
    </div>
  )
}
