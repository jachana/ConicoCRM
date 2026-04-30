const CLEAN_RE = /[\.\s]/g

export function cleanRut(rut: string): string {
  return rut.replace(CLEAN_RE, '').toUpperCase()
}

export function validateRut(rut: string): boolean {
  const cleaned = cleanRut(rut)
  if (!/^\d{1,8}-[\dK]$/.test(cleaned)) return false
  const [digits, dv] = [cleaned.slice(0, -2), cleaned.slice(-1)]
  let total = 0
  let factor = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    total += parseInt(digits[i]) * factor
    factor = factor < 7 ? factor + 1 : 2
  }
  const remainder = total % 11
  const expected = 11 - remainder
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return dv === expectedDv
}

export function formatRut(rut: string): string {
  const cleaned = cleanRut(rut)
  const match = cleaned.match(/^(\d+)-?([\dK])$/)
  if (!match) return rut
  const [, digits, dv] = match
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}
