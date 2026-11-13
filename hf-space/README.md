---
title: n8n Multi-Project Automation Hub
emoji: ⚡
colorFrom: red
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

<!-- ─────── Created: 2026-11-14 | Purpose: Hugging Face Spaces 24/7 Free n8n Multi-Project Hub Guide | Last verified with: n8n 2.32.5 ─────── -->
# n8n Multi-Project Automation Hub (100% Free 24/7 Cloud)

This Space runs **n8n Community Edition** on Hugging Face Spaces (2 vCPU, 16 GB RAM, Free Tier) backed by **Neon Free Serverless PostgreSQL** and kept awake 24/7 by a **Cloudflare Cron Trigger**.

One instance hosts **all of your automation projects** (`[Pinterest]`, `[Facebook]`, `[TikTok]`, `[Booking]`, `[DepEd]`, webhooks, etc.) inside isolated workflows and tags—sharing the same Neon database, Gemini API, Google Sheets Service Account, Cloudflare R2 storage, and Telegram bot.

## Deployment Steps

1. Create a free Space on [Hugging Face Spaces](https://huggingface.co/new-space):
   - **Space SDK:** `Docker` (Blank template)
   - **Hardware:** `CPU basic (2 vCPU, 16 GB RAM)` — \$0/month
   - **Visibility:** `Private` (recommended for automation instances)
2. Copy the contents of `hf-space/` (`Dockerfile`, `entrypoint.sh`, `README.md`) and `workflows/` into the Space repository root (keeping `workflows/` alongside `Dockerfile`).
3. In your Hugging Face Space → **Settings → Variables and secrets**, add these **Secrets** (never hardcode them):
   - `DATABASE_URL` (Neon Postgres connection string — e.g. project named `n8n-hub`)
   - `N8N_ENCRYPTION_KEY` (32-byte hex secret)
   - `GEMINI_API_KEY` (Official free key from Google AI Studio)
   - `CF_WORKER_SECRET` (Bearer token shared with your Cloudflare Media Worker)
   - `PINTEREST_ACCESS_TOKEN` (Pinterest project token; add extra project tokens as needed)
   - `TELEGRAM_BOT_TOKEN`
4. Add these **Variables** in Space Settings:
   - `GENERIC_TIMEZONE` = `Asia/Manila` (or your local IANA timezone)
   - `MAX_PINS_PER_RUN` = `1`
   - `REQUIRE_APPROVAL` = `true`
   - `GSHEETS_DOC_ID` = `<your-pinterest-google-sheet-id>`
   - `GEMINI_MODEL` = `gemini-2.5-flash`
   - `CF_MEDIA_WORKER_URL` = `https://<your-worker>.<subdomain>.workers.dev`
   - `R2_PUBLIC_BASE_URL` = `https://<your-worker-or-r2-domain>`
   - `PINTEREST_ENV` = `sandbox` (switch to `production` after first Pin test)
   - `PINTEREST_API_BASE_URL` = `https://api-sandbox.pinterest.com`
   - `TELEGRAM_CHAT_ID` = `<your-numeric-chat-id>`
5. Once the Space shows **Running**, open the Space URL, create your n8n owner account, and import workflows from `/home/node/workflows/` (or generate new project workflows using `node scripts/new-project.mjs`).
