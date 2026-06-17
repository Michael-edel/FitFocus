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

  const backendTarget = isDocker
    ? 'http://wrangler:8788'
    : 'http://localhost:8788'

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
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              if (id.includes('/pdf/')) return 'pdf';
              if (id.includes('/ui/components/CameraCapture')) return 'camera';
              if (id.includes('/charts')) return 'charts';
              if (id.includes('/geminiService')) return 'ai-core';
              if (id.includes('/weeklyAutoEngine') || id.includes('/orchestrator')) return 'ai-reasoning';
              return undefined;
            }

            if (
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('scheduler') ||
              id.includes('use-sync-external-store') ||
              id.includes('react-is') ||
              id.includes('loose-envify') ||
              id.includes('js-tokens')
            ) return 'react-vendor';
            if (id.includes('lucide-react')) return 'icons-vendor';
            if (id.includes('recharts')) return 'charts-vendor';
            if (id.includes('@google/genai')) return 'google-ai-vendor';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor';
            if (id.includes('heic2any')) return 'heic-vendor';
            if (id.includes('stripe')) return 'stripe-vendor';
            if (id.includes('clsx')) return 'utils-vendor';
            return 'vendor';
          }
        }
      }
    }
  }
})
