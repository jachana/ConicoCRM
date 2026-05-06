import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const isTest = !!process.env.VITEST

export default defineConfig({
  plugins: [
    react(),
    ...(!isTest
      ? [visualizer({ filename: 'dist/stats.html', open: false })]
      : []),
  ],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
