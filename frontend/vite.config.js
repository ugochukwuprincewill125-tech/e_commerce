import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only proxy: lets the local Vite port call {API_URL} same-origin when
// the browser blocks cross-origin requests to the Django dev server.
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Dev convenience only; production talks to the API directly by URL.
      '/dev-api': { target: apiTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/dev-api/, '') },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          data: ['@tanstack/react-query', 'axios', 'react-hook-form'],
        },
      },
    },
  },
})
