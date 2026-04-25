import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

interface ClienteOption {
  id: number
  nombre: string
}

interface Props {
  selected: number[]
  onChange: (ids: number[]) => void
}

export default function ClienteMultiSelect({ selected, onChange }: Props) {
  const [q, setQ] = useState('')
  const [options, setOptions] = useState<ClienteOption[]>([])
  const [open, setOpen] = useState(false)
  const [selectedDetails, setSelectedDetails] = useState<Record<number, string>>({})
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<ClienteOption[]>(`/api/clientes/?q=${encodeURIComponent(q)}`)
        .then(r => setOptions(r.data.slice(0, 30)))
        .catch(() => setOptions([]))
    }, 150)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const unknown = selected.filter(id => !(id in selectedDetails))
    if (unknown.length === 0) return
    Promise.all(
      unknown.map(id =>
        api.get<ClienteOption>(`/api/clientes/${id}`).then(r => r.data).catch(() => null)
      )
    ).then(arr => {
      const next = { ...selectedDetails }
      for (const c of arr) if (c) next[c.id] = c.nombre
      setSelectedDetails(next)
    })
  }, [selected, selectedDetails])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function toggle(id: number) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }

  return (
    <div ref={boxRef} className="relative min-w-[200px]">
      <div
        className="bg-gray-900 border border-white/[0.1] rounded-lg px-2 py-1.5 flex flex-wrap gap-1 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.map(id => (
          <span
            key={id}
            className="bg-amber-400/15 text-amber-200 text-xs px-2 py-0.5 rounded-md flex items-center gap-1"
          >
            {selectedDetails[id] ?? `#${id}`}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(id) }}
              className="text-amber-200/70 hover:text-amber-100"
            >×</button>
          </span>
        ))}
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          placeholder={selected.length ? '' : 'Filtrar clientes...'}
          className="flex-1 min-w-[100px] bg-transparent text-gray-200 text-xs outline-none"
        />
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-gray-900 border border-white/[0.1] rounded-lg max-h-64 overflow-auto shadow-lg">
          {options.map(o => {
            const isSel = selected.includes(o.id)
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => toggle(o.id)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 ${isSel ? 'text-amber-300' : 'text-gray-300'}`}
              >
                {isSel ? '✓ ' : ''}{o.nombre}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
