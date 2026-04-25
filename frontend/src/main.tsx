import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import './index.css'
import 'react-grid-layout/css/styles.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initSentry } from './sentry'

// W1-06 — initialize Sentry as early as possible so subsequent module load
// errors are captured. No-op when DSN is empty (local dev, CI).
initSentry()

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: { detail?: string } } }).response
    if (res?.data?.detail) return res.data.detail
  }
  if (error instanceof Error) return error.message
  return 'Error desconocido'
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
  queryCache: new QueryCache({
    onError: (error) => toast.error(extractMessage(error)),
  }),
  mutationCache: new MutationCache({
    onError: (error) => toast.error(extractMessage(error)),
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster richColors closeButton position="top-right" />
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
