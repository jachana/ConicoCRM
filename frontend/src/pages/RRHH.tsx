import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Empleado, EmpleadoDocumento, EmpleadoVacacion } from '../types'

const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"

type EmpleadoForm = { nombre: string; cargo: string; sueldo_base: string; fecha_ingreso: string; is_active: boolean }
const EMPTY_FORM: EmpleadoForm = { nombre: '', cargo: '', sueldo_base: '', fecha_ingreso: '', is_active: true }

type VacForm = { fecha_inicio: string; fecha_fin: string; dias: string; descripcion: string }
const EMPTY_VAC: VacForm = { fecha_inicio: '', fecha_fin: '', dias: '', descripcion: '' }

function calcDias(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0
  const diff = (new Date(fin).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(diff) + 1)
}

const TIPO_LABELS = { contrato: 'Contrato', liquidacion: 'Liquidación', otro: 'Otro' }

export default function RRHH() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [form, setForm] = useState<EmpleadoForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const [detalle, setDetalle] = useState<Empleado | null>(null)
  const [vacModalOpen, setVacModalOpen] = useState(false)
  const [vacForm, setVacForm] = useState<VacForm>(EMPTY_VAC)
  const [vacError, setVacError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTipo, setUploadTipo] = useState<'contrato' | 'liquidacion' | 'otro'>('contrato')

  const { data: empleados = [], isLoading } = useQuery<Empleado[]>({
    queryKey: ['empleados', busqueda],
    queryFn: () => api.get(`/api/empleados/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const { data: docs = [] } = useQuery<EmpleadoDocumento[]>({
    queryKey: ['empleado-docs', detalle?.id],
    queryFn: () => api.get(`/api/empleados/${detalle!.id}/documentos/`).then(r => r.data),
    enabled: !!detalle,
  })

  const { data: vacaciones = [] } = useQuery<EmpleadoVacacion[]>({
    queryKey: ['empleado-vacs', detalle?.id],
    queryFn: () => api.get(`/api/empleados/${detalle!.id}/vacaciones/`).then(r => r.data),
    enabled: !!detalle,
  })

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true)
  }

  function abrirEditar(e: Empleado) {
    setEditando(e)
    setForm({
      nombre: e.nombre, cargo: e.cargo,
      sueldo_base: e.sueldo_base != null ? String(e.sueldo_base) : '',
      fecha_ingreso: e.fecha_ingreso ?? '',
      is_active: e.is_active,
    })
    setFormError(null); setModalOpen(true)
  }

  function abrirDetalle(e: Empleado) {
    setDetalle(e)
    setUploadError(null)
  }

  const guardarEmpleado = useMutation({
    mutationFn: (data: EmpleadoForm) => {
      const payload = {
        nombre: data.nombre, cargo: data.cargo, is_active: data.is_active,
        sueldo_base: data.sueldo_base ? parseFloat(data.sueldo_base) : null,
        fecha_ingreso: data.fecha_ingreso || null,
      }
      if (editando) return api.patch(`/api/empleados/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/empleados/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); setModalOpen(false) },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminarEmpleado = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empleados/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); if (detalle) setDetalle(null) },
  })

  const subirDoc = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: string }) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tipo', tipo)
      return api.post(`/api/empleados/${detalle!.id}/documentos/`, fd).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }); setUploadError(null) },
    onError: (e: any) => setUploadError(e?.response?.data?.detail ?? 'Error al subir'),
  })

  const eliminarDoc = useMutation({
    mutationFn: (docId: number) => api.delete(`/api/empleados/${detalle!.id}/documentos/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-docs', detalle?.id] }),
  })

  async function descargarDoc(doc: EmpleadoDocumento) {
    const resp = await api.get(`/api/empleados/${detalle!.id}/documentos/${doc.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a'); a.href = url; a.download = doc.nombre; a.click()
    URL.revokeObjectURL(url)
  }

  const guardarVac = useMutation({
    mutationFn: (data: VacForm) => api.post(`/api/empleados/${detalle!.id}/vacaciones/`, {
      fecha_inicio: data.fecha_inicio, fecha_fin: data.fecha_fin,
      dias: parseInt(data.dias) || 0, descripcion: data.descripcion || null,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }); setVacModalOpen(false); setVacForm(EMPTY_VAC) },
    onError: (e: any) => setVacError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminarVac = useMutation({
    mutationFn: (vacId: number) => api.delete(`/api/empleados/${detalle!.id}/vacaciones/${vacId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleado-vacs', detalle?.id] }),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">RRHH</h1>
        <button onClick={abrirCrear} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          Agregar empleado
        </button>
      </div>

      <input
        type="text" placeholder="Buscar por nombre o cargo..."
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Cargo</th>
              <th className="text-left px-4 py-3 font-medium">Sueldo Base</th>
              <th className="text-left px-4 py-3 font-medium">Fecha Ingreso</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {empleados.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin empleados registrados</td></tr>
            )}
            {empleados.map(e => (
              <tr
                key={e.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                onClick={() => abrirDetalle(e)}
              >
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.cargo}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {e.sueldo_base != null ? `$${e.sueldo_base.toLocaleString('es-CL')}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.fecha_ingreso ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${e.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {e.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                  <span className="inline-flex gap-3">
                    <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => eliminarEmpleado.mutate(e.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar empleado */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar empleado' : 'Nuevo empleado'}
              </h2>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardarEmpleado.mutate(form) }} className="px-6 py-4 space-y-4">
              <div>
                <label className={LABEL_CLS}>Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Cargo *</label>
                <input type="text" required value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Sueldo Base</label>
                  <input type="number" min="0" step="1000" value={form.sueldo_base} onChange={e => setForm(f => ({ ...f, sueldo_base: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Fecha Ingreso</label>
                  <input type="date" value={form.fecha_ingreso} onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))} className={INPUT_CLS} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">Activo</label>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
                <button type="submit" disabled={guardarEmpleado.isPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {guardarEmpleado.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel de detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{detalle.nombre}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{detalle.cargo}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold leading-none">×</button>
            </div>

            <div className="overflow-auto flex-1 px-6 py-4 space-y-6">
              {/* Documentos */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documentos</h3>
                  <div className="flex items-center gap-2">
                    <select value={uploadTipo} onChange={e => setUploadTipo(e.target.value as typeof uploadTipo)}
                      className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      <option value="contrato">Contrato</option>
                      <option value="liquidacion">Liquidación</option>
                      <option value="otro">Otro</option>
                    </select>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                      Subir archivo
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirDoc.mutate({ file: f, tipo: uploadTipo }); e.target.value = '' }} />
                  </div>
                </div>
                {uploadError && <p className="text-xs text-red-500 mb-2">{uploadError}</p>}
                {docs.length === 0
                  ? <p className="text-xs text-gray-400">Sin archivos subidos</p>
                  : <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-gray-700 dark:text-gray-300 font-medium truncate flex-1">{d.nombre}</span>
                        <span className="mx-3 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{TIPO_LABELS[d.tipo]}</span>
                        <span className="text-gray-400 mr-3">{new Date(d.subido_en).toLocaleDateString('es-CL')}</span>
                        <span className="flex gap-2">
                          <button onClick={() => descargarDoc(d)} className="text-blue-600 hover:underline">Descargar</button>
                          <button onClick={() => eliminarDoc.mutate(d.id)} className="text-red-500 hover:underline">Eliminar</button>
                        </span>
                      </div>
                    ))}
                  </div>}
              </section>

              {/* Vacaciones */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vacaciones</h3>
                  <button onClick={() => { setVacModalOpen(true); setVacForm(EMPTY_VAC); setVacError(null) }}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Agregar período
                  </button>
                </div>
                {vacaciones.length === 0
                  ? <p className="text-xs text-gray-400">Sin períodos registrados</p>
                  : <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Inicio</th>
                          <th className="text-left px-3 py-2 font-medium">Fin</th>
                          <th className="text-left px-3 py-2 font-medium">Días</th>
                          <th className="text-left px-3 py-2 font-medium">Descripción</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {vacaciones.map(v => (
                          <tr key={v.id}>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{v.fecha_inicio}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{v.fecha_fin}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{v.dias}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{v.descripcion ?? '—'}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => eliminarVac.mutate(v.id)} className="text-red-500 hover:underline">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Modal vacación */}
      {vacModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Agregar período de vacaciones</h3>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardarVac.mutate(vacForm) }} className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Fecha inicio *</label>
                  <input type="date" required value={vacForm.fecha_inicio}
                    onChange={e => {
                      const inicio = e.target.value
                      const dias = calcDias(inicio, vacForm.fecha_fin)
                      setVacForm(f => ({ ...f, fecha_inicio: inicio, dias: dias > 0 ? String(dias) : f.dias }))
                    }} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Fecha fin *</label>
                  <input type="date" required value={vacForm.fecha_fin}
                    onChange={e => {
                      const fin = e.target.value
                      const dias = calcDias(vacForm.fecha_inicio, fin)
                      setVacForm(f => ({ ...f, fecha_fin: fin, dias: dias > 0 ? String(dias) : f.dias }))
                    }} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Días *</label>
                <input type="number" required min="1" value={vacForm.dias}
                  onChange={e => setVacForm(f => ({ ...f, dias: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Descripción</label>
                <input type="text" placeholder="Vacaciones de verano..." value={vacForm.descripcion}
                  onChange={e => setVacForm(f => ({ ...f, descripcion: e.target.value }))} className={INPUT_CLS} />
              </div>
              {vacError && <p className="text-xs text-red-500">{vacError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setVacModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
                <button type="submit" disabled={guardarVac.isPending} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {guardarVac.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
