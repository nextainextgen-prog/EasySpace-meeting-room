#!/bin/sh
# Annotated screenshots for docs/manual. Needs the dev server on :3107 and a
# recent `npm run test:tgbot` (for the chat replays).
set -e
cd "$(dirname "$0")/../.."
OUT=docs/manual/images
BASE=${BASE:-http://localhost:3107}
MARK=$(cat scripts/manual/mark.js)
AB="agent-browser --session manual"
mkdir -p "$OUT"

shot() { # url width height marks file [full]
  $AB set viewport "$2" "$3" >/dev/null
  $AB open "$1" >/dev/null
  $AB wait 2500 >/dev/null
  $AB eval "$MARK; window.__mark($4)" >/dev/null
  if [ "$6" = "full" ]; then $AB screenshot --full "$OUT/$5" >/dev/null; else $AB screenshot "$OUT/$5" >/dev/null; fi
  echo "  $5"
}

echo "portal"
shot "$BASE/dev/portal?state=live&at=14:10" 1440 1000 '[
  {sel:"[data-tour=book]",n:1,round:999},
  {sel:"[data-tour=now]",n:2},
  {sel:"[data-tour=usage]",n:3},
  {sel:"[data-tour=quick]",n:4},
  {sel:"[data-tour=availability]",n:5},
  {sel:"[data-tour=mine]",n:6},
  {sel:"[data-tour=telegram]",n:7},
  {sel:"[data-tour=account]",n:8,round:999}]' portal-desktop.png full
shot "$BASE/dev/portal?state=next&at=10:40" 1440 900 '[{sel:"[data-tour=now]",n:2}]' portal-next.png
shot "$BASE/dev/portal?state=live&at=14:10" 390 844 '[
  {sel:"[data-tour=book]",n:1,round:999},
  {sel:"[data-tour=now]",n:2},
  {sel:"[data-tour=usage]",n:3}]' portal-mobile.png

echo "booking sheet"
$AB set viewport 1440 1000 >/dev/null
$AB open "$BASE/dev/portal?state=next&at=10:40" >/dev/null
$AB wait 2500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB click "[data-tour=book]" >/dev/null
$AB wait 800 >/dev/null
$AB screenshot "$OUT/portal-booking-sheet.png" >/dev/null
echo "  portal-booking-sheet.png"

echo "quick book"
$AB open "$BASE/dev/portal?state=next&at=10:40" >/dev/null
$AB wait 2500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB click "[data-tour=quick] li button" >/dev/null
$AB wait 800 >/dev/null
$AB eval 'document.querySelector("[data-tour=quick] input").value=""; document.querySelector("[data-tour=quick]").scrollIntoView({block:"center"})' >/dev/null
$AB wait 300 >/dev/null
$AB screenshot "[data-tour=quick]" "$OUT/portal-quick.png" >/dev/null
echo "  portal-quick.png"

echo "telegram chat"
for s in link book manage settings ai remind; do
  $AB set viewport 520 900 >/dev/null
  $AB open "$BASE/dev/chat?section=$s" >/dev/null
  $AB wait 1500 >/dev/null
  $AB eval "$MARK; window.__mark([])" >/dev/null
  $AB screenshot --full "$OUT/chat-$s.png" >/dev/null
  echo "  chat-$s.png"
done
$AB close >/dev/null 2>&1 || true
