import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'

export interface PreviewRow {
  fila: number
  fecha_pago: string
  rut_cliente: string
  monto: number
  folio_documento: string
  accion: 'crear' | 'actualizar' | 'error'
}

export interface PreviewError {
  fila: number
  fecha_pago?: string
  rut_cliente?: string
  monto?: string
  folio_documento?: string
  motivo: string
}

export interface PreviewResp {
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  filas: PreviewRow[]
  errores: PreviewError[]
}

export interface ImportRow {
  fila: number
  fecha_pago: string
  rut_cliente: string
  monto: number
  folio_documento: string
  estado: 'created' | 'updated' | 'pending' | 'error'
  motivo?: string
}

export interface ImportResp {
  created: number
  updated: number
  pending: number
  error: number
  rows: ImportRow[]
}

export function usePaymentImport() {
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [result, setResult] = useState<ImportResp | null>(null)
  const [loading, setLoading] = useState(false)

  async function downloadTemplate() {
    try {
      const resp = await api.get('/api/onboarding/payments/template', { responseType: 'blob' })
      try {
        const url = URL.createObjectURL(resp.data as Blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'plantilla_pagos.xlsx'
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        // In test environment, URL.createObjectURL may not be available
        if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
          throw new Error('Failed to create download link')
        }
      }
    } catch {
      toast.error('Error al descargar plantilla')
    }
  }

  async function previewFile(file: File): Promise<PreviewResp> {
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post<PreviewResp>('/api/onboarding/payments/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(resp.data)
      return resp.data
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al previsualizar')
      throw err
    } finally {
      setLoading(false)
    }
  }

  async function importFile(file: File): Promise<ImportResp> {
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const resp = await api.post<ImportResp>('/api/onboarding/payments/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(resp.data)
      const { created, updated, error } = resp.data
      toast.success(`Importación completada — ${created} creados, ${updated} actualizados${error ? `, ${error} con error` : ''}`)
      return resp.data
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Error al importar')
      throw err
    } finally {
      setLoading(false)
    }
  }

  async function downloadReport(importId: string): Promise<void> {
    try {
      const resp = await api.get(`/api/onboarding/payments/imports/${importId}/report`, { responseType: 'blob' })
      try {
        const url = URL.createObjectURL(resp.data as Blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'reporte_pagos.xlsx'
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        // In test environment, URL.createObjectURL may not be available
        if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
          throw new Error('Failed to create download link')
        }
      }
    } catch {
      toast.error('Error al descargar reporte')
    }
  }

  function reset() {
    setPreview(null)
    setResult(null)
  }

  return {
    preview,
    result,
    loading,
    downloadTemplate,
    previewFile,
    importFile,
    downloadReport,
    reset,
  }
}
