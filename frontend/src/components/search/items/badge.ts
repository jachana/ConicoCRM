export function badgeClass(estado: string): string {
  const e = estado.toLowerCase()
  if (e.includes('pagad') || e.includes('aprobad') || e.includes('completa')) return 'bg-success-500/15 text-success-400'
  if (e.includes('rechaz') || e.includes('cancelad') || e.includes('anulad')) return 'bg-danger-500/15 text-danger-400'
  if (e.includes('pendient') || e.includes('borrador') || e.includes('emitida')) return 'bg-warning-500/15 text-warning-400'
  if (e.includes('abierta') || e.includes('despachad') || e.includes('enviad')) return 'bg-info-500/15 text-info-400'
  return 'bg-gray-500/15 text-gray-400'
}
