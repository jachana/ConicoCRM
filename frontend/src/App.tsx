import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ThemeProvider } from './components/layout/ThemeProvider'

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
