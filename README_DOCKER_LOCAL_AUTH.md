# Local Google OAuth (Docker)

This project uses:
- Vite dev server on http://localhost:5173
- Cloudflare Pages Functions locally via Wrangler on http://localhost:8788

## 1) Frontend env
Copy `.env.local.example` -> `.env.local` and set:
- `VITE_GOOGLE_CLIENT_ID_LOCAL`
- `VITE_GOOGLE_CLIENT_ID_PROD` (can be same as local for now)

## 2) Functions env (Wrangler)
Copy `.dev.vars.example` -> `.dev.vars` and set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_JWT_SECRET`

## 3) Run
```bash
docker compose down -v
docker compose up --build
```

Vite proxies `/api/*` to the `wrangler` service, so `/api/auth/google` works locally.
