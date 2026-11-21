#!/bin/sh
# Prepara la base D1 local (persistida en /data) y levanta EventHub en el puerto 8787.
set -eu

npx wrangler d1 migrations apply DB --local --persist-to /data

if [ "${SEED_DEMO:-true}" = "true" ]; then
  # Solo inserta eventos de ejemplo si la base está vacía.
  npx wrangler d1 execute DB --local --persist-to /data --file seed/demo-events.sql
fi

exec npx wrangler dev --ip 0.0.0.0 --port 8787 --persist-to /data --show-interactive-dev-session=false
