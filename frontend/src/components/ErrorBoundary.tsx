import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Sentry } from '../sentry'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Forward to Sentry. captureException is a no-op when Sentry was not
    // initialized (DSN empty), so this is safe in local/dev.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 max-w-lg w-full text-left">
          <h2 className="text-red-700 dark:text-red-400 font-semibold mb-2">Error inesperado</h2>
          <p className="text-sm text-red-600 dark:text-red-300 font-mono break-all">{error.message}</p>
          {error.stack && (
            <pre className="mt-3 text-xs text-red-500 dark:text-red-400 overflow-auto max-h-48 whitespace-pre-wrap">
              {error.stack}
            </pre>
          )}
          <button
            className="mt-4 px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }
}
