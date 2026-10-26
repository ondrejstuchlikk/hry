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
    test: {
      environment: 'node',
    },
  }
})
