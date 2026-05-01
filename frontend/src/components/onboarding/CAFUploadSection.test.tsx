import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CAFUploadSection } from './CAFUploadSection'
import * as cafsApi from '../../api/cafs'

vi.mock('../../api/cafs')
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
    renderWithQuery(<CAFUploadSection empresaId={1} />)
    expect(screen.getByText(/Cargar CAF/)).toBeInTheDocument()
  })

  it('shows instruction text for file upload', () => {
    renderWithQuery(<CAFUploadSection empresaId={1} />)
    expect(screen.getByText(/Arrastra o selecciona archivos CAF/)).toBeInTheDocument()
  })

  it('renders CAF list section', () => {
    renderWithQuery(<CAFUploadSection empresaId={1} />)
    expect(screen.getByText(/CAFs Actuales/)).toBeInTheDocument()
  })

  it('displays no CAFs message when list is empty', async () => {
    renderWithQuery(<CAFUploadSection empresaId={1} />)

    await waitFor(() => {
      expect(screen.getByText(/No hay CAFs cargados aún/)).toBeInTheDocument()
    })
  })

  it('renders upload area component', () => {
    renderWithQuery(<CAFUploadSection empresaId={1} />)
    const selectBtn = screen.getByText(/Seleccionar archivo/)
    expect(selectBtn).toBeInTheDocument()
  })

  it('passes empresaId to listCAFs', async () => {
    vi.mocked(cafsApi.listCAFs).mockResolvedValue({ count: 0, cafs: [] })
    renderWithQuery(<CAFUploadSection empresaId={123} />)

    await waitFor(() => {
      expect(vi.mocked(cafsApi.listCAFs)).toHaveBeenCalledWith(123)
    }, { timeout: 3000 })
  })
})
