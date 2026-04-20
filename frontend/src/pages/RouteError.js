import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
export default function RouteError() {
    const error = useRouteError();
    const message = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : error instanceof Error
            ? error.message
            : 'Error desconocido';
    return (_jsx("div", { className: "flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center", children: _jsxs("div", { className: "rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 max-w-lg w-full text-left", children: [_jsx("h2", { className: "text-red-700 dark:text-red-400 font-semibold mb-2", children: "Error de navegaci\u00F3n" }), _jsx("p", { className: "text-sm text-red-600 dark:text-red-300 font-mono break-all", children: message }), error instanceof Error && error.stack && (_jsx("pre", { className: "mt-3 text-xs text-red-500 dark:text-red-400 overflow-auto max-h-48 whitespace-pre-wrap", children: error.stack })), _jsx(Link, { to: "/", className: "mt-4 inline-block px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700", children: "Volver al inicio" })] }) }));
}
