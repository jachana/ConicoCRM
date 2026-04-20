import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/');
        }
        catch {
            setError('Credenciales incorrectas. Intenta de nuevo.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "min-h-screen flex items-center justify-center bg-[#090E1A] relative overflow-hidden px-4", children: [_jsx("div", { className: "absolute inset-0 opacity-[0.04]", style: {
                    backgroundImage: `
            linear-gradient(rgba(245,158,11,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,158,11,1) 1px, transparent 1px)
          `,
                    backgroundSize: '56px 56px',
                } }), _jsx("div", { className: "absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_60%,rgba(245,158,11,0.06),transparent)]" }), _jsxs("div", { className: "relative w-full max-w-sm", children: [_jsxs("div", { className: "mb-8 text-center select-none", children: [_jsxs("div", { className: "inline-flex items-baseline", children: [_jsx("span", { className: "text-[2.75rem] font-bold text-white tracking-tight leading-none", children: "CO" }), _jsx("span", { className: "text-[2.75rem] font-bold text-brand-400 tracking-tight leading-none", children: "NI" }), _jsx("span", { className: "text-[2.75rem] font-bold text-white tracking-tight leading-none", children: "CO" })] }), _jsx("p", { className: "mt-2 text-[11px] text-gray-600 tracking-[0.3em] uppercase font-medium", children: "Sistema de Gesti\u00F3n" })] }), _jsxs("div", { className: "bg-[#111827] border border-white/8 rounded-2xl p-8 shadow-2xl shadow-black/60", children: [_jsx("h2", { className: "text-base font-semibold text-white mb-6", children: "Iniciar sesi\u00F3n" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: e => setEmail(e.target.value), required: true, autoComplete: "email", placeholder: "usuario@conico.cl", className: "w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm\n                           placeholder-gray-700 transition-colors\n                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-semibold text-gray-500 mb-1.5 tracking-widest uppercase", children: "Contrase\u00F1a" }), _jsx("input", { type: "password", value: password, onChange: e => setPassword(e.target.value), required: true, autoComplete: "current-password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", className: "w-full px-4 py-3 bg-[#0B1120] border border-white/10 rounded-xl text-white text-sm\n                           placeholder-gray-700 transition-colors\n                           focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20" })] }), error && (_jsx("div", { className: "flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2.5", children: _jsx("span", { children: error }) })), _jsx("button", { type: "submit", disabled: loading, className: "w-full py-3 mt-1 bg-brand-500 hover:bg-brand-400 active:bg-brand-600\n                         text-gray-900 font-semibold text-sm rounded-xl tracking-wide\n                         disabled:opacity-50 transition-all duration-150", children: loading ? 'Verificando...' : 'Ingresar' })] })] }), _jsxs("p", { className: "mt-6 text-center text-xs text-gray-700", children: ["Conico \u00A9 ", new Date().getFullYear()] })] })] }));
}
