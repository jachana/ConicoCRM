import { createBrowserRouter, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Users from './pages/Users'
import { useAuthStore } from './stores/auth'
import AppLayout from './components/layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <div className="p-6 text-gray-700 dark:text-gray-300">Dashboard — próximamente</div> },
      { path: 'usuarios', element: <Users /> },
    ],
  },
])
