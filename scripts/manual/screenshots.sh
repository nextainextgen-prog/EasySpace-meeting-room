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

# Crop one element out of a full-page capture (element screenshots misplace
# the clip when a sticky header is on the page).
shotEl() { # selector file
  RECT=$($AB eval "(() => { document.querySelector('header')?.style.setProperty('position','static'); const r=[...document.querySelectorAll('$1')].find(e=>e.getBoundingClientRect().width>0).getBoundingClientRect(); return [Math.round(r.left+scrollX-12),Math.round(r.top+scrollY-12),Math.round(r.width+24),Math.round(r.height+24)].join(' ') })()" | tr -d '"')
  set -- "$1" "$2" $RECT
  $AB screenshot --full "$OUT/.full.png" >/dev/null
  magick "$OUT/.full.png" -crop "${5}x${6}+${3}+${4}" +repage "$OUT/$2"
  rm -f "$OUT/.full.png"
}

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
  {sel:"[data-tour=nav]",n:8,round:16}]' portal-desktop.png full
shot "$BASE/dev/portal?state=next&at=10:40" 1440 900 '[{sel:"[data-tour=now]",n:2}]' portal-next.png
shot "$BASE/dev/portal?state=live&at=14:10" 390 844 '[
  {sel:"[data-tour=book]",n:1,round:999},
  {sel:"[data-tour=now]",n:2},
  {sel:"[data-tour=usage]",n:3}]' portal-mobile.png

echo "quick book"
$AB set viewport 1440 900 >/dev/null
$AB open "$BASE/dev/portal?state=next&at=10:40" >/dev/null
$AB wait 2500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB eval 'document.querySelector("[data-tour=quick]").scrollIntoView({block:"center"})' >/dev/null
shotEl "[data-tour=quick]" portal-quick.png && echo "  portal-quick.png"

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

echo "staff manual extras"
AB="agent-browser --session manual"
clickText() { # scope text
  $AB eval "[...document.querySelectorAll('$1 button')].find(b => b.textContent.trim().endsWith('$2'))?.click()" >/dev/null
}
$AB set viewport 390 844 >/dev/null
$AB open "$BASE/member-login" >/dev/null
$AB wait 2000 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB screenshot "$OUT/staff-login.png" >/dev/null && echo "  staff-login.png"

$AB set viewport 1440 900 >/dev/null
$AB open "$BASE/dev/portal?state=live&at=14:10" >/dev/null
$AB wait 2500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
shotEl "[data-tour=now]" staff-now-live.png && echo "  staff-now-live.png"
$AB open "$BASE/dev/portal?state=next&at=10:40" >/dev/null
$AB wait 2500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB eval "document.querySelector('[data-tour=mine]').scrollIntoView({block:'center'})" >/dev/null
shotEl "[data-tour=mine]" staff-mine.png && echo "  staff-mine.png"
$AB eval "document.querySelector('header')?.style.removeProperty('position')" >/dev/null
clickText "[data-tour=mine]" "ยกเลิก"
$AB wait 800 >/dev/null
$AB screenshot "$OUT/staff-cancel.png" >/dev/null && echo "  staff-cancel.png"

$AB set viewport 520 900 >/dev/null
$AB open "$BASE/dev/chat?section=usage" >/dev/null
$AB wait 1500 >/dev/null
$AB eval "$MARK; window.__mark([])" >/dev/null
$AB screenshot --full "$OUT/chat-usage.png" >/dev/null && echo "  chat-usage.png"
$AB close >/dev/null 2>&1 || true
