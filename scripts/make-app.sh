#!/bin/bash
# Build the desktop launchers:
#   "Content Research.app"       double-click: start the local server if needed, open the app in its own window
#   "Stop Content Research.app"  stops the server
# Both go to /Applications (or $1), with shortcuts on the Desktop.
#   bash scripts/make-app.sh [destination folder, default /Applications]
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-/Applications}"
NAME="Content Research"
APP="$DEST/$NAME.app"
STOP="$DEST/Stop $NAME.app"
NODE="$(command -v node)"
PORT="${PORT:-5178}"
PROFILE="$HOME/Library/Application Support/$NAME/window"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -n "$NODE" ] || { echo "Không thấy node"; exit 1; }

# 1. Launcher. Opens a Chrome app window (no tabs or address bar, own profile so it remembers its size);
#    falls back to the default browser when Chrome is not installed.
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
			display dialog "Không bật được Content Research. Xem log: " & repo & "/data/server.log" buttons {"OK"} default button 1 with icon stop
			return
		end if
	end if
	try
		do shell script "test -d '/Applications/Google Chrome.app'"
		do shell script "open -na 'Google Chrome' --args --app=" & url_ & " --user-data-dir=" & quoted form of "$PROFILE" & " --window-size=1440,900 --no-first-run --no-default-browser-check"
	on error
		open location url_
	end try
end run
EOF

cat > "$TMP/stop.applescript" <<EOF
on run
	do shell script "/usr/bin/pkill -f " & quoted form of "$REPO/src/main.js" & " || /usr/bin/pkill -f 'node .*src/main.js' || true"
	display notification "Đã tắt server" with title "$NAME"
end run
EOF

make_icns() { # $1 svg, $2 output .icns
  qlmanage -t -s 1024 -o "$TMP" "$1" >/dev/null 2>&1
  local png="$TMP/$(basename "$1").png" set="$TMP/icon.iconset"
  [ -f "$png" ] || return 1
  rm -rf "$set" && mkdir -p "$set"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$png" --out "$set/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$set" -o "$2"
}

build() { # $1 script, $2 app path, $3 bundle id
  rm -rf "$2"
  osacompile -o "$2" "$1"
  if make_icns "$REPO/scripts/icon.svg" "$2/Contents/Resources/applet.icns"; then
    # osacompile also ships Assets.car with the default script icon, which wins over applet.icns.
    rm -f "$2/Contents/Resources/Assets.car"
    /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$2/Contents/Info.plist" 2>/dev/null || true
  else
    echo "Không tạo được icon (giữ icon mặc định)"
  fi
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $3" "$2/Contents/Info.plist" 2>/dev/null || true
  codesign --force --deep -s - "$2" 2>/dev/null || true   # re-sign after editing the bundle
  touch "$2"
  echo "✔ $2"
}

build "$TMP/launcher.applescript" "$APP" local.content-research.launcher
build "$TMP/stop.applescript" "$STOP" local.content-research.stop
rm -rf "$DEST/YouTube Research.app"   # launcher from before the rename

# Desktop shortcuts (symlinks: they show the app icon and open it), replacing old ones.
for target in "$APP" "$STOP"; do
  link="$HOME/Desktop/$(basename "$target")"
  if [ -L "$link" ] || [ ! -e "$link" ]; then ln -sfn "$target" "$link" && echo "✔ $link"; else echo "Bỏ qua $link (đã có file thật ở đó)"; fi
done
[ -L "$HOME/Desktop/YouTube Research.app" ] && rm "$HOME/Desktop/YouTube Research.app"
exit 0
