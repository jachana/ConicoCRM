import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { search, type SearchResults } from '../api/search'

const DEBOUNCE_MS = 200

export function useGlobalSearch(rawQuery: string) {
  const [debounced, setDebounced] = useState(rawQuery)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [rawQuery])

  return useQuery<SearchResults>({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => search(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    placeholderData: prev => prev,
    retry: 1,
  })
}
