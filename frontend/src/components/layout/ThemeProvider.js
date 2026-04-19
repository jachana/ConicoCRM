import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
const ThemeContext = createContext({ theme: 'light', toggle: () => { } });
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark')
            return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('theme', theme);
    }, [theme]);
    return (_jsx(ThemeContext.Provider, { value: { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }, children: children }));
}
export const useTheme = () => useContext(ThemeContext);
