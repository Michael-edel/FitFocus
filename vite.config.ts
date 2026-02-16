import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Исправление: Определение __dirname для окружения ESM (Vite), так как оно недоступно глобально
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Dev-only: безопасный прокси /api/ai (ключ только на сервере).
      // В production на Cloudflare работает /functions/api/ai.ts.
      middlewareMode: false,
    },
    plugins: [
      // --- /api/ai middleware (DEV only) ---
      {
        name: 'fitfocus-ai-proxy',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/ai', async (req, res, next) => {
            try {
              if (req.method !== 'POST') return next();

              const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || env.GEMINI_API_KEY || env.API_KEY || env.GOOGLE_API_KEY;
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Server Gemini key missing. Set GEMINI_API_KEY (or API_KEY) in container env.' }));
                return;
              }

              // Защита от типичной ошибки: в .env кладут русскую заглушку вроде "ВАШ_КЛЮЧ".
              // Библиотека добавляет ключ в HTTP header, а Node требует ByteString (только ASCII/latin1).
              // Если здесь не отловить — процесс упадёт.
              const looksNonAscii = /[^\x00-\x7F]/.test(apiKey);
              const looksPlaceholder = /placeholder|ваш|ключ|your/i.test(apiKey);
              if (looksNonAscii || looksPlaceholder) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'Invalid GEMINI_API_KEY value. Put the REAL ASCII key string (it обычно начинается с "AIza...") into .env / container env. Do not use placeholders like "ВАШ_КЛЮЧ".'
                }));
                return;
              }

              let body = '';
              req.on('data', (c) => (body += c));
              req.on('end', async () => {
                let payload: any = {};
                try { payload = JSON.parse(body || '{}'); } catch { payload = {}; }

                const model = payload.model || 'gemini-3-flash-preview';
                const feature = payload.feature || 'generic';
                const config = payload.config;
                let contents = payload.contents;

                // Нормализуем contents: строка -> user text
                if (typeof contents === 'string') {
                  contents = [{ role: 'user', parts: [{ text: contents }] }];
                }

                const { GoogleGenAI } = await import('@google/genai');
                const client = new GoogleGenAI({ apiKey });
                const response = await client.models.generateContent({
                  model,
                  contents,
                  config,
                });

                // Возвращаем совместимо с functions/api/ai.ts
                const text = (response as any)?.text || '';
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  feature,
                  candidates: [{ content: { parts: [{ text }] } }],
                }));
              });
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e?.message || 'AI proxy error' }));
            }
          });
        },
      },
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // IMPORTANT: disable Service Worker in local dev.
        // Otherwise SW + aggressive caching can "take over" localhost and cause
        // confusing behavior (old UI, missing assets/photos, even blank screens).
        devOptions: { enabled: false },
        includeAssets: [
          'icon.svg', 
          'maskable-icon.svg',
          'Inter-VariableFont.ttf'
        ],
        manifest: {
          name: 'FitFocus',
          short_name: 'FitFocus',
          description: 'AI-коуч по питанию и привычкам. Анализ еды по фото, курс, коучинг и семейное меню.',
          lang: 'ru',
          theme_color: '#0f172a',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
            { src: '/maskable-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
          ]
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,svg,woff,woff2,ttf,otf,png,jpg,jpeg,webp}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
              options: { cacheName: 'api' }
            },
            {
              urlPattern: ({ request }) => request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              urlPattern: ({ request }) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: { cacheName: 'pages', networkTimeoutSeconds: 3 }
            },
            {
              urlPattern: ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'assets' }
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});