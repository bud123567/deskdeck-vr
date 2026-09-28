#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
swift build --package-path host -c release
BIN_DIR=$(swift build --package-path host -c release --show-bin-path)
APP="$PWD/artifacts/DeskDeck Host.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Frameworks"
cp "$BIN_DIR/DeskDeckHost" "$APP/Contents/MacOS/DeskDeckHost"
cp -R "$BIN_DIR/WebRTC.framework" "$APP/Contents/Frameworks/"
install_name_tool -add_rpath '@executable_path/../Frameworks' "$APP/Contents/MacOS/DeskDeckHost"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.deskdeck.host</string><key>CFBundleName</key><string>DeskDeck Host</string><key>CFBundleExecutable</key><string>DeskDeckHost</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSLocalNetworkUsageDescription</key><string>Connect directly to your headset to stream your desktop.</string></dict></plist>
PLIST
codesign --force --sign - "$APP/Contents/Frameworks/WebRTC.framework"
codesign --force --sign - "$APP"
echo "Built $APP"
