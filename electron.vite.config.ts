import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(currentDirectory, 'src/main/index.ts'),
          'artifact-scanner-worker': resolve(
            currentDirectory,
            'src/main/integration/artifacts/worker.ts',
          ),
          'session-search-hydration-worker': resolve(
            currentDirectory,
            'src/main/integration/search/sessionSearchHydrationWorkerMain.ts',
          ),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(currentDirectory, 'src/preload/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(currentDirectory, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(currentDirectory, 'src/renderer/src'),
      },
    },
    server: {
      allowedHosts: ['droid.ilanndardour.com'],
      host: '0.0.0.0',
      port: 3105,
      proxy: {
        '/__oxox': {
          target: 'http://127.0.0.1:3106',
          ws: true,
        },
      },
      strictPort: true,
    },
    preview: {
      allowedHosts: ['droid.ilanndardour.com'],
      host: '0.0.0.0',
      port: 3105,
      proxy: {
        '/__oxox': {
          target: 'http://127.0.0.1:3106',
          ws: true,
        },
      },
      strictPort: true,
    },
  },
})
