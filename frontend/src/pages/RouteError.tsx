import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'

export default function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Error desconocido'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
      <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 max-w-lg w-full text-left">
        <h2 className="text-red-700 dark:text-red-400 font-semibold mb-2">Error de navegación</h2>
        <p className="text-sm text-red-600 dark:text-red-300 font-mono break-all">{message}</p>
        {error instanceof Error && error.stack && (
          <pre className="mt-3 text-xs text-red-500 dark:text-red-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
        <Link
          to="/"
          className="mt-4 inline-block px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
