#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose pull frontend backend db
docker compose up -d --no-build --force-recreate migrate backend frontend
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:8080/api/health"
