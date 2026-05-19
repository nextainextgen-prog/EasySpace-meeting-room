#!/usr/bin/env bash
# Push SUPABASE_SERVICE_ROLE_KEY from .env.local → Vercel production
# Usage: bash scripts/push-service-key.sh

set -euo pipefail

KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | sed 's/^SUPABASE_SERVICE_ROLE_KEY=//' | tr -d '"')

if [ -z "$KEY" ] || [ ${#KEY} -lt 50 ]; then
  echo "✗ Local .env.local has no valid SUPABASE_SERVICE_ROLE_KEY (length=${#KEY})"
  exit 1
fi

echo "→ Local key length: ${#KEY}"

# Remove existing (which is empty/broken), ignore error if it doesn't exist
echo "→ Removing existing production var (if any)..."
vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes 2>/dev/null || true

# Add fresh
echo "→ Adding new value..."
printf '%s' "$KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production

echo "→ Redeploying to production..."
vercel --prod

echo "✓ Done. Try logging in at the production URL."
