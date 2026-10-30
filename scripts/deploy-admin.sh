#!/usr/bin/env bash
# Assembles the admin and deploys it to Cloudflare (needs `npx wrangler login` once).
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/assemble-admin.sh
cd admin && CI=1 npx wrangler deploy
