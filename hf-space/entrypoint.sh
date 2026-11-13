#!/bin/sh
# ─────── Created: 2026-11-14 | Purpose: Entrypoint parsing Neon DATABASE_URL, Render Free & HF Space host for n8n | Last verified with: n8n 2.32.5 ───────
# Run with AI CLI: [rovodev run / opencode]

set -eu

# Parse Neon PostgreSQL DATABASE_URL into n8n DB_POSTGRESDB_* env vars if provided
if [ -n "${DATABASE_URL:-}" ]; then
  eval "$(node -e '
    const raw = process.env.DATABASE_URL;
    const u = new URL(raw);
    const db = u.pathname.replace(/^\//, "");
    const port = u.port || "5432";
    const esc = (s) => String(s || "").replace(/'\''/g, "'\''\\'\'''\''");
    console.log("export DB_TYPE=postgresdb");
    console.log("export DB_POSTGRESDB_HOST='\''" + esc(u.hostname) + "'\''");
    console.log("export DB_POSTGRESDB_PORT='\''" + esc(port) + "'\''");
    console.log("export DB_POSTGRESDB_DATABASE='\''" + esc(db) + "'\''");
    console.log("export DB_POSTGRESDB_USER='\''" + esc(decodeURIComponent(u.username)) + "'\''");
    console.log("export DB_POSTGRESDB_PASSWORD='\''" + esc(decodeURIComponent(u.password)) + "'\''");
    console.log("export DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false");
  ')"
fi

# Respect Render.com dynamic PORT (fallback to 7860)
export N8N_PORT="${PORT:-${N8N_PORT:-7860}}"

# Auto-configure Render.com Free Web Service public URL & 512MB RAM guard
if [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
  export N8N_HOST="${RENDER_EXTERNAL_HOSTNAME}"
  export N8N_PROTOCOL="https"
  export WEBHOOK_URL="https://${RENDER_EXTERNAL_HOSTNAME}/"
  export N8N_EDITOR_BASE_URL="https://${RENDER_EXTERNAL_HOSTNAME}/"
  export N8N_PROXY_HOPS="1"
fi

if [ "${RENDER:-false}" = "true" ] && [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=384"
fi

# Auto-configure Hugging Face Spaces public URL if present
if [ -n "${SPACE_HOST:-}" ]; then
  export N8N_HOST="${SPACE_HOST}"
  export N8N_PORT="7860"
  export N8N_PROTOCOL="https"
  export WEBHOOK_URL="https://${SPACE_HOST}/"
  export N8N_EDITOR_BASE_URL="https://${SPACE_HOST}/"
  export N8N_PROXY_HOPS="1"
fi

# Start n8n server
exec n8n start
