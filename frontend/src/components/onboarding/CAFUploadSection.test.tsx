import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CAFUploadSection } from './CAFUploadSection'
import * as cafsApi from '../../api/cafs'

vi.mock('../../api/cafs', () => ({
  listCAFs: vi.fn().mockResolvedValue({ count: 0, cafs: [] }),
  uploadCAFs: vi.fn(),
  getCAF: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function renderWithQuery(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('CAFUploadSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({ count: 0, cafs: [] })
  })

  it('renders upload section header', () => {
    renderWithQuery(<CAFUploadSection />)
    expect(screen.getByText(/Cargar CAF/)).toBeInTheDocument()
  })

  it('shows instruction text for file upload', () => {
    renderWithQuery(<CAFUploadSection />)
    expect(screen.getByText(/Arrastra o selecciona archivos CAF/)).toBeInTheDocument()
  })

  it('renders CAF list section', () => {
    renderWithQuery(<CAFUploadSection />)
    expect(screen.getByText(/CAFs Actuales/)).toBeInTheDocument()
  })

  it('displays no CAFs message when list is empty', async () => {
    renderWithQuery(<CAFUploadSection />)

    await waitFor(() => {
      expect(screen.getByText(/No hay CAFs cargados aún/)).toBeInTheDocument()
    })
  })

  it('renders upload area component', () => {
    renderWithQuery(<CAFUploadSection />)
    const selectBtn = screen.getByText(/Seleccionar archivo/)
    expect(selectBtn).toBeInTheDocument()
  })

  it('renders CAF list after mount', async () => {
    renderWithQuery(<CAFUploadSection />)
    await waitFor(() => {
      expect(screen.getByText(/No hay CAFs cargados aún/)).toBeInTheDocument()
    })
  })
})
