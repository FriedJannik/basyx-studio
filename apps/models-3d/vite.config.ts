import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { occtWithoutEval, vuetifySettings } from '../shared/vite.ts'

// The UI is served under /app/<installation>/ui/, so every URL is relative.
// The 3D viewer's parser worker is a module (ADR 0038); its WebAssembly
// files are assets of the package. The worker reads STEP without
// `new Function`, which the app's CSP forbids (apps/shared/vite.ts).
export default defineConfig({
  root: 'ui',
  base: './',
  plugins: [vue(), vuetifySettings(), occtWithoutEval()],
  worker: { format: 'es', plugins: () => [occtWithoutEval()] },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
  },
})
