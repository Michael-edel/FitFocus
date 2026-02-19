import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import crypto from 'node:crypto'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  // ===============================
  // AUTO ENV DETECTION
  // ===============================

  const isDocker =
    process.env.DOCKER === 'true' ||
    process.env.HOSTNAME === 'wrangler' ||
    process.env.WSL_DISTRO_NAME !== undefined

  const backendTarget = env.VITE_BACKEND_TARGET || (isDocker
    ? 'http://wrangler:8788'
    : 'http://localhost:8788')

  console.log('🔧 Vite mode:', mode)
  console.log('🐳 Docker detected:', isDocker)
  console.log('➡ Backend target:', backendTarget)

  return {
    envDir: '.',
    envPrefix: 'VITE_',

    define: {
      __VITE_GOOGLE_CLIENT_ID_LOCAL__: JSON.stringify(
        env.VITE_GOOGLE_CLIENT_ID_LOCAL || ''
      ),
      __VITE_GOOGLE_CLIENT_ID_PROD__: JSON.stringify(
        env.VITE_GOOGLE_CLIENT_ID_PROD || ''
      )
    },

    server: {
      port: 5173,
      host: '0.0.0.0',

      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true
        }
      }
    },

    plugins: [
      react(),

      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: false },

        manifest: {
          name: 'FitFocus',
          short_name: 'FitFocus',
          description: 'AI-коуч по питанию и привычкам',
          lang: 'ru',
          theme_color: '#0f172a',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            }
          ]
        }
      })
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    }
  }
})
