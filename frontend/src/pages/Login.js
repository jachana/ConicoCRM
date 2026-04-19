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
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950", children: _jsxs("div", { className: "w-full max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white mb-2", children: "Conico PMS" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mb-6", children: "Ingresa a tu cuenta" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsx("input", { type: "email", placeholder: "Email", value: email, onChange: e => setEmail(e.target.value), required: true, className: "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg\n                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white\n                       focus:outline-none focus:ring-2 focus:ring-blue-500" }), _jsx("input", { type: "password", placeholder: "Contrase\u00F1a", value: password, onChange: e => setPassword(e.target.value), required: true, className: "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg\n                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white\n                       focus:outline-none focus:ring-2 focus:ring-blue-500" }), error && _jsx("p", { className: "text-sm text-red-500", children: error }), _jsx("button", { type: "submit", disabled: loading, className: "w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium\n                       rounded-lg disabled:opacity-50 transition-colors", children: loading ? 'Ingresando...' : 'Ingresar' })] })] }) }));
}
