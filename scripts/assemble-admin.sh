#!/usr/bin/env bash
# Builds dist-admin/: the admin app plus the shared files it imports (tokens, forms modules, brand
# assets), ready for a static host on its own origin (Cloudflare Pages: build command
# `bash scripts/assemble-admin.sh`, output directory `dist-admin`). It only copies files.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-admin && mkdir -p dist-admin/forms dist-admin/assets
cp admin/*.html admin/*.js admin/*.css dist-admin/
cp docs/tokens.css dist-admin/
cp docs/forms/*.js docs/forms/*.css dist-admin/forms/
cp -R docs/assets/brand docs/assets/fonts docs/assets/screens dist-admin/assets/
cp docs/assets/og-image.png dist-admin/assets/
# The admin is served from the root of its own origin, so its page and the shared files sit side by side.
cat > dist-admin/_headers <<'EOF'
/*
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
EOF
echo "dist-admin ready"
