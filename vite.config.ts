import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const SERVER_PORT = Number(process.env['PORT'] ?? 3000)

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client/src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: `http://localhost:${SERVER_PORT}`, ws: true }
    }
  }
})
