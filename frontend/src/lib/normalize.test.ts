import { describe, it, expect } from 'vitest'
import { normalizeText, matchesNormalized } from './normalize'

describe('normalizeText', () => {
  it('strips diacritics', () => {
    expect(normalizeText('Cliénte')).toBe('cliente')
    expect(normalizeText('María José')).toBe('maria jose')
    expect(normalizeText('Ñandú')).toBe('nandu')
  })

  it('handles null/undefined/empty', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText('')).toBe('')
  })
})

describe('matchesNormalized', () => {
  it('matches across accented forms', () => {
    expect(matchesNormalized('Cliénte Importante', 'cliente')).toBe(true)
    expect(matchesNormalized('cliente importante', 'CLIÉNTE')).toBe(true)
    expect(matchesNormalized('María', 'maria')).toBe(true)
  })

  it('returns true on empty needle', () => {
    expect(matchesNormalized('whatever', '')).toBe(true)
  })

  it('returns false when no overlap', () => {
    expect(matchesNormalized('Cliente', 'producto')).toBe(false)
  })

  it('handles null haystack', () => {
    expect(matchesNormalized(null, 'a')).toBe(false)
    expect(matchesNormalized(undefined, 'a')).toBe(false)
  })
})
