import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui'

interface UserMin {
  id: number
  name: string
  role: string
  is_active?: boolean
}

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  disabled?: boolean
  placeholder?: string
}

export default function VendedorSelect({ value, onChange, disabled = false, placeholder = '— Sin asignar —' }: Props) {
  const { data: users = [] } = useQuery<UserMin[]>({
    queryKey: ['users-vendedores'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    staleTime: 60_000,
  })

  const vendedores = users.filter(u => u.role === 'vendedor' && u.is_active !== false)

  return (
    <Select
      value={value != null ? String(value) : 'none'}
      onValueChange={v => onChange(v === 'none' ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {vendedores.map(u => (
          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
