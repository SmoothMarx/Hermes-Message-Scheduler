import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/main.tsx',
      name: 'ScheduledMessages',
      formats: ['iife'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['react'],
      output: {
        globals: {
          react: 'window.__HERMES_PLUGIN_SDK__.React'
        }
      }
    }
  },
  define: {
    'process.env': {}
  }
})
