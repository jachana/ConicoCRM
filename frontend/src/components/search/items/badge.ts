export function badgeClass(estado: string): string {
  const e = estado.toLowerCase()
  if (e.includes('pagad') || e.includes('aprobad') || e.includes('completa')) return 'bg-green-500/15 text-green-400'
  if (e.includes('rechaz') || e.includes('cancelad') || e.includes('anulad')) return 'bg-red-500/15 text-red-400'
  if (e.includes('pendient') || e.includes('borrador') || e.includes('emitida')) return 'bg-yellow-500/15 text-yellow-400'
  if (e.includes('abierta') || e.includes('despachad') || e.includes('enviad')) return 'bg-blue-500/15 text-blue-400'
  return 'bg-gray-500/15 text-gray-400'
}
