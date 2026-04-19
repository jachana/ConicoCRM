import { jsx as _jsx } from "react/jsx-runtime";
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from './components/layout/ThemeProvider';
export default function App() {
    return (_jsx(ThemeProvider, { children: _jsx(RouterProvider, { router: router }) }));
}
