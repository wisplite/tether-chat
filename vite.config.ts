import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // SQLite rewrites these on every message; Vite treats that as a full reload.
      ignored: ['**/server/**/*.db', '**/server/**/*.db-*'],
    },
  },
})
