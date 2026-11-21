# Imagen portable de EventHub: API (Worker) + frontend + base D1 local, ejecutados con
# el runtime oficial de Cloudflare (workerd vía Wrangler). No necesita cuenta de Cloudflare.
#
#   docker build -t eventhub .
#   docker run -p 8787:8787 eventhub        →  http://localhost:8787

# ---------- Frontend ----------
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
RUN npm run build

# ---------- Runtime ----------
# Debian (glibc) porque workerd no corre en Alpine.
FROM node:24-slim
ENV NODE_ENV=development \
    WRANGLER_SEND_METRICS=false \
    SEED_DEMO=true
# workerd exige certificados CA del sistema para arrancar.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/backend /app/frontend /data \
    && chown node:node /app/backend /data
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/eventhub-start
# Todo lo que sigue corre sin privilegios de root.
USER node
WORKDIR /app/backend
COPY --chown=node:node backend/package*.json ./
# Instala dependencias y quita las herramientas que solo se usan en CI (tipos y sentry-cli).
RUN npm ci \
    && npm uninstall --no-save typescript @cloudflare/workers-types @sentry/cli \
    && npm cache clean --force
COPY --chown=node:node backend/wrangler.jsonc backend/tsconfig.json ./
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/migrations ./migrations
COPY --chown=node:node backend/seed ./seed
COPY --from=frontend --chown=node:node /app/frontend/dist /app/frontend/dist
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["eventhub-start"]
