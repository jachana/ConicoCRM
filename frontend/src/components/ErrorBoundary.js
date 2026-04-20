import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }
    render() {
        const { error } = this.state;
        if (!error)
            return this.props.children;
        return (_jsx("div", { className: "flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center", children: _jsxs("div", { className: "rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 max-w-lg w-full text-left", children: [_jsx("h2", { className: "text-red-700 dark:text-red-400 font-semibold mb-2", children: "Error inesperado" }), _jsx("p", { className: "text-sm text-red-600 dark:text-red-300 font-mono break-all", children: error.message }), error.stack && (_jsx("pre", { className: "mt-3 text-xs text-red-500 dark:text-red-400 overflow-auto max-h-48 whitespace-pre-wrap", children: error.stack })), _jsx("button", { className: "mt-4 px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700", onClick: () => this.setState({ error: null }), children: "Reintentar" })] }) }));
    }
}
