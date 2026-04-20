import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import './index.css';
import 'react-grid-layout/css/styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
function extractMessage(error) {
    if (error && typeof error === 'object' && 'response' in error) {
        const res = error.response;
        if (res?.data?.detail)
            return res.data.detail;
    }
    if (error instanceof Error)
        return error.message;
    return 'Error desconocido';
}
const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1 } },
    queryCache: new QueryCache({
        onError: (error) => toast.error(extractMessage(error)),
    }),
    mutationCache: new MutationCache({
        onError: (error) => toast.error(extractMessage(error)),
    }),
});
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(ErrorBoundary, { children: _jsxs(QueryClientProvider, { client: queryClient, children: [_jsx(Toaster, { richColors: true, closeButton: true, position: "top-right" }), _jsx(App, {})] }) }) }));
