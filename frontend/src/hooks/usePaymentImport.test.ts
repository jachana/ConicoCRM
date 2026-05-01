import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import { usePaymentImport } from './usePaymentImport'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('usePaymentImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => usePaymentImport())

    expect(result.current.preview).toBeNull()
    expect(result.current.result).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('downloads template', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/vnd.ms-excel' })
    ;(apiModule.api.get as any).mockResolvedValue({ data: mockBlob })

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      await result.current.downloadTemplate()
    })

    expect(apiModule.api.get).toHaveBeenCalledWith(
      '/api/onboarding/payments/template',
      expect.objectContaining({ responseType: 'blob' })
    )
  })

  it('previews file and sets preview state', async () => {
    const mockFile = new File(['test'], 'test.xlsx')
    const mockPreviewData = {
      total_filas: 10,
      filas_validas: 8,
      filas_invalidas: 2,
      filas: [
        {
          fila: 1,
          fecha_pago: '2026-05-01',
          rut_cliente: '12345678-9',
          monto: 100000,
          folio_documento: 'F-001',
          accion: 'crear',
        },
      ],
      errores: [],
    }

    ;(apiModule.api.post as any).mockResolvedValue({ data: mockPreviewData })

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      await result.current.previewFile(mockFile)
    })

    await waitFor(() => {
      expect(result.current.preview).toEqual(mockPreviewData)
    })
  })

  it('imports file successfully', async () => {
    const mockFile = new File(['test'], 'test.xlsx')
    const mockResult = {
      created: 5,
      updated: 2,
      pending: 1,
      error: 0,
      rows: [
        {
          fila: 1,
          fecha_pago: '2026-05-01',
          rut_cliente: '12345678-9',
          monto: 100000,
          folio_documento: 'F-001',
          estado: 'created',
          motivo: null,
        },
      ],
    }

    ;(apiModule.api.post as any).mockResolvedValue({ data: mockResult })

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      await result.current.importFile(mockFile)
    })

    await waitFor(() => {
      expect(result.current.result).toEqual(mockResult)
    })
  })

  it('handles preview file errors', async () => {
    const mockFile = new File(['test'], 'test.xlsx')
    const mockError = {
      response: {
        data: {
          detail: 'Invalid file format',
        },
      },
    }

    ;(apiModule.api.post as any).mockRejectedValue(mockError)

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      try {
        await result.current.previewFile(mockFile)
      } catch {
        // Error expected
      }
    })

    expect(result.current.preview).toBeNull()
  })

  it('handles import file errors', async () => {
    const mockFile = new File(['test'], 'test.xlsx')
    const mockError = {
      response: {
        data: {
          detail: 'Import failed',
        },
      },
    }

    ;(apiModule.api.post as any).mockRejectedValue(mockError)

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      try {
        await result.current.importFile(mockFile)
      } catch {
        // Error expected
      }
    })

    expect(result.current.result).toBeNull()
  })

  it('downloads report', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/vnd.ms-excel' })
    ;(apiModule.api.get as any).mockResolvedValue({ data: mockBlob })

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      await result.current.downloadReport('import-123')
    })

    expect(apiModule.api.get).toHaveBeenCalledWith(
      '/api/onboarding/payments/imports/import-123/report',
      expect.objectContaining({ responseType: 'blob' })
    )
  })

  it('resets state', async () => {
    const mockFile = new File(['test'], 'test.xlsx')
    const mockPreviewData = {
      total_filas: 10,
      filas_validas: 8,
      filas_invalidas: 2,
      filas: [],
      errores: [],
    }

    ;(apiModule.api.post as any).mockResolvedValue({ data: mockPreviewData })

    const { result } = renderHook(() => usePaymentImport())

    await act(async () => {
      await result.current.previewFile(mockFile)
    })

    expect(result.current.preview).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.preview).toBeNull()
    expect(result.current.result).toBeNull()
  })
})
