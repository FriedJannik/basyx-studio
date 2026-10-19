import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { vuetifySettings } from '../shared/vite.ts'

// The UI is served under /app/<installation>/ui/, so every URL is relative.
export default defineConfig({
  root: 'ui',
  base: './',
  plugins: [vue(), vuetifySettings()],
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
})
