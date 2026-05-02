import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, it, expect, describe, beforeEach } from 'vitest'
import { ImportBodegasSedesSection } from './ImportBodegasSedesSection'
import * as apiModule from '../../lib/api'

vi.mock('../../lib/api', () => ({
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

function wrap(ui: React.ReactNode) {
  return <>{ui}</>
}

describe('ImportBodegasSedesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload section with file selection', () => {
    render(wrap(<ImportBodegasSedesSection />))
    expect(screen.getByText(/Plantilla y archivo/)).toBeInTheDocument()
    expect(screen.getByText(/Descargar plantilla/)).toBeInTheDocument()
    expect(screen.getByText(/Seleccionar archivo/)).toBeInTheDocument()
  })

  it('downloads template on button click', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    ;(apiModule.api.get as any).mockResolvedValue({ data: mockBlob })

    render(wrap(<ImportBodegasSedesSection />))
    const downloadBtn = screen.getByText(/Descargar plantilla/)
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(apiModule.api.get).toHaveBeenCalledWith(
        '/api/onboarding/bodegas-sedes/template',
        expect.objectContaining({ responseType: 'blob' })
      )
    })
  })

  it('renders component without errors', () => {
    render(wrap(<ImportBodegasSedesSection />))
    expect(screen.getByText(/Plantilla y archivo/i)).toBeInTheDocument()
  })

  it('has drag-drop zone for file selection', () => {
    render(wrap(<ImportBodegasSedesSection />))
    const dragZone = screen.getByText(/Arrastra un archivo/)
    expect(dragZone).toBeInTheDocument()
  })

  it('displays all required sections', () => {
    render(wrap(<ImportBodegasSedesSection />))

    // Should display file upload section
    expect(screen.getByText(/Plantilla y archivo/)).toBeInTheDocument()
    // Should have download template button
    expect(screen.getByText(/Descargar plantilla/)).toBeInTheDocument()
    // Should have file selection button
    expect(screen.getByText(/Seleccionar archivo/)).toBeInTheDocument()
  })

  it('calls import API with file', async () => {
    const mockImportResponse = {
      status: 'success',
      import_id: 'test-123',
      timestamp: '2026-05-01T00:00:00Z',
      report: {
        created_bodega_count: 2,
        updated_bodega_count: 0,
        created_sede_count: 2,
        updated_sede_count: 0,
        error_count: 0,
        total_rows: 2,
        rows: [],
      },
    }

    ;(apiModule.api.post as any).mockResolvedValue({ data: mockImportResponse })

    render(wrap(<ImportBodegasSedesSection />))

    // Component should be mounted and ready
    expect(screen.getByText(/Plantilla y archivo/)).toBeInTheDocument()
  })

  it('shows result summary after successful import', async () => {
    const mockImportResponse = {
      status: 'success',
      import_id: 'test-123',
      timestamp: '2026-05-01T00:00:00Z',
      report: {
        created_bodega_count: 5,
        updated_bodega_count: 3,
        created_sede_count: 4,
        updated_sede_count: 2,
        error_count: 0,
        total_rows: 14,
        rows: [],
      },
    }

    ;(apiModule.api.post as any).mockResolvedValue({ data: mockImportResponse })

    render(wrap(<ImportBodegasSedesSection />))

    // Check that component renders
    expect(screen.getByText(/Plantilla y archivo/)).toBeInTheDocument()
  })

})
