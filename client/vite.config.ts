import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Same-origin from the browser's perspective in dev — no CORS needed for local
    // development, and mirrors how a production reverse proxy would typically serve
    // client and API from one origin.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
