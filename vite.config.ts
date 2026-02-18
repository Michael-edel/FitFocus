import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import crypto from 'node:crypto';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Исправление: Определение __dirname для окружения ESM (Vite), так как оно недоступно глобально
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
// Ensure Vite reads env files from project root (where docker-compose places .env/.env.local)
envDir: '.',
// Expose only VITE_ vars to the client
envPrefix: 'VITE_',
define: {
  // Compile-time fallbacks (used if import.meta.env is empty in browser due to custom setup)
  __VITE_GOOGLE_CLIENT_ID_LOCAL__: JSON.stringify(
    env.VITE_GOOGLE_CLIENT_ID_LOCAL || process.env.VITE_GOOGLE_CLIENT_ID_LOCAL || ''
  ),
  __VITE_GOOGLE_CLIENT_ID_PROD__: JSON.stringify(
    env.VITE_GOOGLE_CLIENT_ID_PROD || process.env.VITE_GOOGLE_CLIENT_ID_PROD || ''
  ),
  // Also try to patch import.meta.env.* directly (works in most Vite setups)
  'import.meta.env.VITE_GOOGLE_CLIENT_ID_LOCAL': JSON.stringify(
    env.VITE_GOOGLE_CLIENT_ID_LOCAL || process.env.VITE_GOOGLE_CLIENT_ID_LOCAL || ''
  ),
  'import.meta.env.VITE_GOOGLE_CLIENT_ID_PROD': JSON.stringify(
    env.VITE_GOOGLE_CLIENT_ID_PROD || process.env.VITE_GOOGLE_CLIENT_ID_PROD || ''
  ),
},
    server: {
      port: 5173,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
      // Proxy /api to local Cloudflare Pages Functions (wrangler service in docker-compose)
      proxy: {
        '/api': {
          target: 'http://wrangler:8788',
          changeOrigin: true,
        },
      },
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
      // --- /api/auth/google middleware (DEV only) ---
      {
        name: 'fitfocus-google-auth',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/api/auth/google', async (req, res, next) => {
            try {
              if (req.method !== 'POST') return next();

              const chunks: Buffer[] = [];
              req.on('data', (c) => chunks.push(Buffer.from(c)));
              req.on('end', async () => {
                try {
                  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
                  let payload: any = {};
                  try { payload = JSON.parse(raw); } catch { payload = {}; }

                  const credential = payload?.credential;
                  if (!credential || typeof credential !== 'string') {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Missing credential' }));
                    return;
                  }

                  const authSecret = process.env.AUTH_JWT_SECRET || env.AUTH_JWT_SECRET;
                  if (!authSecret) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Server missing AUTH_JWT_SECRET (set in .env / docker compose env)' }));
                    return;
                  }

                  // Accept BOTH local + prod client IDs (универсально для одного кода).
                  // Accept BOTH local + prod client IDs (универсально для одного кода).
                  const allowedAud = new Set<string>([
                    process.env.VITE_GOOGLE_CLIENT_ID_LOCAL || env.VITE_GOOGLE_CLIENT_ID_LOCAL,
                    process.env.VITE_GOOGLE_CLIENT_ID_PROD || env.VITE_GOOGLE_CLIENT_ID_PROD,
                    process.env.GOOGLE_CLIENT_ID_LOCAL || env.GOOGLE_CLIENT_ID_LOCAL,
                    process.env.GOOGLE_CLIENT_ID_PROD || env.GOOGLE_CLIENT_ID_PROD,
                  ].filter(Boolean) as string[]);

                  if (allowedAud.size === 0) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Server missing Google Client ID env (set VITE_GOOGLE_CLIENT_ID_LOCAL/PROD or GOOGLE_CLIENT_ID_LOCAL/PROD)' }));
                    return;
                  }

                  // Validate token with Google
                  const tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential);
                  const r = await fetch(tokenInfoUrl);
                  if (!r.ok) {
                    const t = await r.text();
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid Google token', details: t.slice(0, 200) }));
                    return;
                  }
                  const info: any = await r.json();

                  if (!allowedAud.has(String(info.aud || ''))) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Token aud mismatch', aud: info.aud }));
                    return;
                  }
                  if (info.iss !== 'https://accounts.google.com' && info.iss !== 'accounts.google.com') {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Token iss mismatch', iss: info.iss }));
                    return;
                  }

                  const user = {
                    sub: String(info.sub || ''),
                    email: String(info.email || ''),
                    name: String(info.name || info.given_name || ''),
                    picture: String(info.picture || ''),
                    email_verified: String(info.email_verified || '') === 'true',
                  };

                  const now = Math.floor(Date.now() / 1000);
                  const session = signJwtHS256(
                    {
                      v: 1,
                      sub: user.sub,
                      email: user.email,
                      name: user.name,
                      picture: user.picture,
                      iat: now,
                      exp: now + 60 * 60 * 24 * 30,
                    },
                    authSecret
                  );

                  const isHttps =
                    (req.headers['x-forwarded-proto'] === 'https') ||
                    (String(req.headers.origin || '').startsWith('https://'));

                  const cookie = serializeCookie('ff_session', session, {
                    httpOnly: true,
                    secure: isHttps, // IMPORTANT: localhost over http must be non-secure cookie
                    sameSite: 'Lax',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                  });

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Set-Cookie', cookie);
                  res.end(JSON.stringify({ ok: true, user }));
                } catch (e: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Server error', details: e?.message || String(e) }));
                }
              });
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Auth middleware error', details: e?.message || String(e) }));
            }
          });

          function base64url(input: Buffer) {
            return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
          }
          function signJwtHS256(payload: any, secret: string) {
            const header = { alg: 'HS256', typ: 'JWT' };
            const h = base64url(Buffer.from(JSON.stringify(header), 'utf8'));
            const p = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
            const data = `${h}.${p}`;
            const sig = crypto.createHmac('sha256', secret).update(data).digest();
            return `${data}.${base64url(sig)}`;
          }
          function serializeCookie(name: string, value: string, opts: any) {
            const parts = [`${name}=${value}`];
            if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
            if (opts.path) parts.push(`Path=${opts.path}`);
            if (opts.httpOnly) parts.push('HttpOnly');
            if (opts.secure) parts.push('Secure');
            if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
            return parts.join('; ');
          }
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