import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    // Não vigiar a pasta do Rust (target/) — evita EBUSY no .dll do Tauri.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // Encaminha as chamadas da UI para o motor Python (FastAPI).
      '/api': {
        target: 'http://127.0.0.1:8077',
        changeOrigin: true,
      },
    },
  },
})
