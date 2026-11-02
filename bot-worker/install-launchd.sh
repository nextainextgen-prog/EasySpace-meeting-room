#!/bin/sh
# Keep the bot's brain running on this Mac: starts at login, restarts if it
# stops, and keeps the Mac from idle-sleeping while it runs (caffeinate -i).
#   sh bot-worker/install-launchd.sh            install / reinstall
#   sh bot-worker/install-launchd.sh uninstall  remove
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL=com.easyspace.tgbot-worker
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"
CLAUDE="$(command -v claude)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "$1" = "uninstall" ]; then rm -f "$PLIST"; echo "removed $LABEL"; exit 0; fi
[ -n "$NODE" ] || { echo "node not found"; exit 1; }
[ -n "$CLAUDE" ] || { echo "claude CLI not found"; exit 1; }
mkdir -p "$HERE/logs" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>$NODE</string><string>$HERE/worker.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CLAUDE_BIN</key><string>$CLAUDE</string>
    <key>PATH</key><string>$(dirname "$CLAUDE"):$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HERE/logs/worker.log</string>
  <key>StandardErrorPath</key><string>$HERE/logs/worker.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL — logs: $HERE/logs/worker.log"
