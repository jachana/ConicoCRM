import { api } from '../lib/api'

export interface CAFUploadResult {
  filename: string
  valid: boolean
  tipo_dte?: string
  num_inicio?: number
  num_fin?: number
  rut_emisor?: string
  message: string
  errors: string[]
  warnings: string[]
  caf_id?: number
}

export interface CAFUploadResponse {
  success: boolean
  total_files: number
  processed: number
  results: CAFUploadResult[]
}

export interface CAFDetail {
  id: number
  empresa_id: number
  tipo_dte: string
  num_inicio: number
  num_fin: number
  vigente: boolean
  consumido: number
  total_folios: number
  folios_restantes: number
  porcentaje_consumido: number
  fecha_carga?: string
  created_at?: string
  updated_at?: string
}

export interface CAFListResponse {
  count: number
  cafs: CAFDetail[]
}

/**
 * Upload one or more CAF XML files
 */
export async function uploadCAFs(
  empresaId: number,
  files: File[]
): Promise<CAFUploadResponse> {
  const formData = new FormData()
  files.forEach((file) => {
    formData.append('files', file)
  })

  const { data } = await api.post<CAFUploadResponse>(
    `/api/onboarding/cafs?empresa_id=${empresaId}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  )
  return data
}

/**
 * Get list of CAFs for an empresa
 */
export async function listCAFs(empresaId: number): Promise<CAFListResponse> {
  const { data } = await api.get<CAFListResponse>(
    `/api/onboarding/cafs?empresa_id=${empresaId}`
  )
  return data
}

/**
 * Get a single CAF by ID
 */
export async function getCAF(cafId: number): Promise<CAFDetail> {
  const { data } = await api.get<CAFDetail>(`/api/onboarding/cafs/${cafId}`)
  return data
}
