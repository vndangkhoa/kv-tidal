#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== [1/4] Building Next.js Frontend ==="
cd "$ROOT_DIR/frontend"
npm run build

echo "=== [2/4] Building Rust Backend (Release) ==="
cd "$ROOT_DIR/backend"
cargo build --release

echo "=== [3/4] Assembling SPK Staging Payload ==="
STAGE_DIR="$ROOT_DIR/build_spk"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/package/bin"
mkdir -p "$STAGE_DIR/package/web"

# Copy binary & frontend static files
cp "$ROOT_DIR/backend/target/release/kv-tidal" "$STAGE_DIR/package/bin/kv-tidal"
chmod +x "$STAGE_DIR/package/bin/kv-tidal"
cp -r "$ROOT_DIR/frontend/out/"* "$STAGE_DIR/package/web/"

# Pack package.tgz
cd "$STAGE_DIR/package"
tar -czf "$STAGE_DIR/package.tgz" *

# Copy Synology metadata, icons, and scripts
cd "$ROOT_DIR/spk"
cp INFO "$STAGE_DIR/INFO"
cp PACKAGE_ICON.PNG "$STAGE_DIR/PACKAGE_ICON.PNG"
cp PACKAGE_ICON_256.PNG "$STAGE_DIR/PACKAGE_ICON_256.PNG"
cp -r conf "$STAGE_DIR/conf"
cp -r scripts "$STAGE_DIR/scripts"
cp -r WIZARD_UIFILES "$STAGE_DIR/WIZARD_UIFILES"

echo "=== [4/4] Creating Final Synology SPK Archive ==="
cd "$STAGE_DIR"
SPK_OUTPUT="$ROOT_DIR/kv-tidal.spk"
rm -f "$SPK_OUTPUT"

# Create final SPK tar archive
tar -cf "$SPK_OUTPUT" --format=gnu INFO conf scripts WIZARD_UIFILES PACKAGE_ICON.PNG PACKAGE_ICON_256.PNG package.tgz

rm -rf "$STAGE_DIR"

echo "=========================================================="
echo " SUCCESS: Synology SPK package built at:"
echo "   $SPK_OUTPUT"
echo " Package Size: $(du -h "$SPK_OUTPUT" | cut -f1)"
echo " Ready for Manual Install in Synology DSM Package Center!"
echo "=========================================================="
