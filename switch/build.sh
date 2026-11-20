#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/switch"
BUILD="/tmp/tankwars-switch-port"
APP="$BUILD/switch"

# nx.js fat NROs are packaged with a prebuilt runtime; devkitPro is not needed.
# We mirror the source outside the Desktop path because esbuild can stall while
# scanning this directory on some macOS setups.
mkdir -p "$APP"
cp "$ROOT/game.js" "$BUILD/game.js"
cp "$SRC/package.json" "$APP/package.json"
cp "$SRC/icon.jpg" "$APP/icon.jpg"
if [ -f "$SRC/package-lock.json" ]; then cp "$SRC/package-lock.json" "$APP/package-lock.json"; fi
rm -rf "$APP/src"
cp -R "$SRC/src" "$APP/src"

cd "$APP"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
fi

rm -rf "$APP/romfs"
npm run build
mkdir -p "$APP/romfs"
cp -R "$SRC/romfs/." "$APP/romfs/"
npm run nro

cp "$APP/tank-wars.nro" "$SRC/tank-wars.nro"
echo
echo "Switch package: $SRC/tank-wars.nro"
ls -lh "$SRC/tank-wars.nro"
