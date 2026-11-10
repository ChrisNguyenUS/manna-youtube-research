#!/bin/bash
# Build "YouTube Research.app": double-click starts the local server (if not running) and opens the browser.
#   bash scripts/make-app.sh [destination folder, default /Applications]
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-/Applications}"
APP="$DEST/YouTube Research.app"
NODE="$(command -v node)"
PORT="${PORT:-5178}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -n "$NODE" ] || { echo "Không thấy node"; exit 1; }

# 1. AppleScript launcher
cat > "$TMP/launcher.applescript" <<EOF
on run
	set repo to "$REPO"
	set url_ to "http://localhost:$PORT"
	set code_ to (do shell script "/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 1 " & url_ & "/api/status || true")
	if code_ is not "200" then
		do shell script "cd " & quoted form of repo & "; mkdir -p data; PORT=$PORT nohup '$NODE' --disable-warning=ExperimentalWarning src/main.js < /dev/null >> data/server.log 2>&1 &"
		repeat 40 times
			delay 0.25
			set code_ to (do shell script "/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 1 " & url_ & "/api/status || true")
			if code_ is "200" then exit repeat
		end repeat
		if code_ is not "200" then
			display dialog "Không bật được server. Xem log: " & repo & "/data/server.log" buttons {"OK"} default button 1 with icon stop
			return
		end if
	end if
	open location url_
end run
EOF

rm -rf "$APP"
osacompile -o "$APP" "$TMP/launcher.applescript"

# 2. Icon: SVG -> PNG (Quick Look) -> iconset -> icns
qlmanage -t -s 1024 -o "$TMP" "$REPO/scripts/icon.svg" >/dev/null 2>&1
PNG="$TMP/icon.svg.png"
if [ -f "$PNG" ]; then
  SET="$TMP/icon.iconset"
  mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$PNG" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$PNG" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/applet.icns"
  # osacompile also ships Assets.car with the default script icon, which wins over applet.icns.
  rm -f "$APP/Contents/Resources/Assets.car"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
else
  echo "Không tạo được icon (giữ icon mặc định)"
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier local.youtube-research.launcher" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --deep -s - "$APP" 2>/dev/null || true   # re-sign after editing the bundle
touch "$APP"
echo "✔ $APP"
