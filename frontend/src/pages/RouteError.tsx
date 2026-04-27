import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { Button } from '../components/ui'

export default function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Error desconocido'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
      <div
        role="alert"
        className="rounded-lg border border-danger-300 bg-danger-50 dark:bg-danger-950 dark:border-danger-800 p-6 max-w-lg w-full text-left"
      >
        <h2 className="text-danger-700 dark:text-danger-400 font-semibold mb-2">Error de navegación</h2>
        <p className="text-sm text-danger-600 dark:text-danger-300 font-mono break-all">{message}</p>
        {error instanceof Error && error.stack && (
          <pre className="mt-3 text-xs text-danger-500 dark:text-danger-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
        <Link to="/" className="mt-4 inline-block">
          <Button variant="danger" size="sm">Volver al inicio</Button>
        </Link>
      </div>
    </div>
  )
}
