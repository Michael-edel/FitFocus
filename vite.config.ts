import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
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

  const backendTarget = isDocker
    ? 'http://wrangler:8788'
    : 'http://localhost:8788'

  console.log('Vite mode:', mode)
  console.log('Docker detected:', isDocker)
  console.log('Backend target:', backendTarget)

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

    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined

            const normalizedId = id.replace(/\\/g, '/')
            const isReactPackage = /\/node_modules\/(react|react-dom)\//.test(normalizedId)

            if (isReactPackage) return 'vendor-react'
            if (normalizedId.includes('/node_modules/recharts/')) return 'vendor-charts'
            if (normalizedId.includes('/node_modules/jspdf')) return 'vendor-pdf'
            if (normalizedId.includes('/node_modules/heic2any/')) return 'vendor-heic'
            if (normalizedId.includes('/node_modules/lucide-react/')) return 'vendor-icons'
            return 'vendor'
          }
        }
      }
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    }
  }
})
