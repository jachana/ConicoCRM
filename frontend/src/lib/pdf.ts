import { api } from './api'

export async function openPdf(url: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'application/pdf' })
  const objectUrl = URL.createObjectURL(blob)
  const win = window.open(objectUrl, '_blank')
  // revoke after the tab has had time to load
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
  if (!win) {
    // fallback: trigger download if popup blocked
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = 'documento.pdf'
    a.click()
  }
}
