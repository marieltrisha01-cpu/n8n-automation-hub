# ─────── Created: 2026-11-14 | Purpose: 24/7 Free n8n Docker Image for Render.com Free Tier (and compatible Docker hosts) | Last verified with: n8n 2.32.5 ───────
# Run with AI CLI: [docker build -f hf-space/Dockerfile -t n8n-automation-hub .]

# ghcr.io mirror avoids docker.n8n.io 429 rate limits on shared Render builders
FROM ghcr.io/n8n-io/n8n:latest

USER root

# Copy custom entrypoint and pre-packaged modular n8n workflows (build context = repo root)
COPY hf-space/entrypoint.sh /entrypoint.sh
COPY workflows/ /home/node/workflows/

RUN chmod +x /entrypoint.sh \
    && mkdir -p /home/node/.n8n \
    && chown -R node:node /home/node

USER node

ENV N8N_PORT=7860 \
    N8N_PROTOCOL=https \
    N8N_PROXY_HOPS=1 \
    N8N_DIAGNOSTICS_ENABLED=false \
    N8N_PERSONALIZATION_ENABLED=false \
    N8N_HIRING_BANNER_ENABLED=false \
    EXECUTIONS_DATA_PRUNE=true \
    EXECUTIONS_DATA_MAX_AGE=168

EXPOSE 7860

ENTRYPOINT ["/entrypoint.sh"]
