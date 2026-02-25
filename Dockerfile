# FitFocus local dev (Vite) in Docker
FROM node:20-alpine

WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \
  else npm i; fi

# Copy the rest
COPY . .

EXPOSE 5173

# Vite must listen on 0.0.0.0 inside Docker
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","5173"]
