const DIACRITICS = /[̀-ͯ]/g

export function normalizeText(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

export function matchesNormalized(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true
  return normalizeText(haystack).includes(normalizeText(needle))
}
