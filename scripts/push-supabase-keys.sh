#!/usr/bin/env bash
# Push all 3 Supabase env vars from .env.local → Vercel production.
# This catches the common "Invalid API key" loop on /admin/dashboard caused
# by a truncated paste, trailing newline, or stale key in Vercel.
#
# Usage: bash scripts/push-supabase-keys.sh

set -euo pipefail

ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found. Run from repo root."
  exit 1
fi

read_var() {
  # Strip surrounding quotes, trim trailing CR/whitespace.
  grep "^$1=" "$ENV_FILE" \
    | head -n1 \
    | sed "s/^$1=//" \
    | sed 's/^"\(.*\)"$/\1/' \
    | tr -d '\r'
}

URL=$(read_var NEXT_PUBLIC_SUPABASE_URL)
ANON=$(read_var NEXT_PUBLIC_SUPABASE_ANON_KEY)
SERVICE=$(read_var SUPABASE_SERVICE_ROLE_KEY)

echo "→ Sanity check (local):"
echo "  NEXT_PUBLIC_SUPABASE_URL        len=${#URL}    prefix=${URL:0:18}"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY   len=${#ANON}   prefix=${ANON:0:10}"
echo "  SUPABASE_SERVICE_ROLE_KEY       len=${#SERVICE} prefix=${SERVICE:0:10}"

if [ ${#URL} -lt 20 ] || [ ${#ANON} -lt 100 ] || [ ${#SERVICE} -lt 100 ]; then
  echo "✗ One of the keys looks too short. Check $ENV_FILE."
  exit 1
fi

push_var() {
  local NAME="$1"
  local VALUE="$2"
  echo "→ Pushing $NAME to production…"
  vercel env rm "$NAME" production --yes >/dev/null 2>&1 || true
  printf '%s' "$VALUE" | vercel env add "$NAME" production >/dev/null
  echo "  ✓ $NAME pushed"
}

push_var NEXT_PUBLIC_SUPABASE_URL "$URL"
push_var NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON"
push_var SUPABASE_SERVICE_ROLE_KEY "$SERVICE"

echo "→ Redeploying to production…"
vercel --prod

echo "✓ Done. After deploy finishes, log in again at the prod URL."
