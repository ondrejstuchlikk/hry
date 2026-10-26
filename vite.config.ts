/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// VITE_BASE must match the GitHub repo name for GitHub Pages, e.g. "/hry/".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE || '/hry/',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Keep the Supabase client out of the app chunk (stays under the 500 kB warning).
          manualChunks: (id: string) => (id.includes('node_modules/@supabase/') ? 'supabase' : undefined),
        },
      },
    },
    test: {
      environment: 'node',
    },
  }
})
