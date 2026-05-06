import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /** Electron `loadFile(dist/index.html)` için zorunlu: asset yolları ./ ile üretilsin */
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    cors: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
