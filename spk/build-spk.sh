#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PKG_NAME="kvtidal"
VERSION="$(grep '^version=' "$ROOT_DIR/spk/INFO" | cut -d'"' -f2)"
[ -z "$VERSION" ] && VERSION="1.0.0-4"
ARCH="x64"
DSM_VER="7.2"

echo "=== [1/4] Preparing SPK Staging Payload ==="
STAGE_DIR="$ROOT_DIR/build_spk"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/package/bin"
mkdir -p "$STAGE_DIR/package/web"
mkdir -p "$STAGE_DIR/package/ui"

# Copy DSM Main Menu UI integration (config + icons)
if [ -d "$ROOT_DIR/spk/ui" ]; then
    cp -r "$ROOT_DIR/spk/ui/"* "$STAGE_DIR/package/ui/"
fi

if [ -f "$ROOT_DIR/backend/target/release/kv-tidal" ]; then
    echo "Using freshly compiled Bookworm release binary from backend/target/release/kv-tidal..."
    cp "$ROOT_DIR/backend/target/release/kv-tidal" "$STAGE_DIR/package/bin/kv-tidal"
    if [ -d "$ROOT_DIR/frontend/out" ]; then
        echo "Using fresh frontend build from frontend/out..."
        cp -r "$ROOT_DIR/frontend/out/"* "$STAGE_DIR/package/web/"
    fi
elif docker image inspect vndangkhoa/kv-tidal:latest >/dev/null 2>&1; then
    echo "Using Debian Bookworm (GLIBC 2.36 compatible) binary from docker image..."
    CID=$(docker create vndangkhoa/kv-tidal:latest)
    docker cp "$CID:/app/kv-tidal" "$STAGE_DIR/package/bin/kv-tidal"
    if [ -d "$ROOT_DIR/frontend/out" ]; then
        echo "Using fresh frontend build from frontend/out..."
        cp -r "$ROOT_DIR/frontend/out/"* "$STAGE_DIR/package/web/"
    else
        docker cp "$CID:/app/web/." "$STAGE_DIR/package/web/"
    fi
    docker rm -f "$CID" >/dev/null
else
    echo "Docker image not found, building frontend & backend on host..."
    cd "$ROOT_DIR/frontend"
    npm run build
    cd "$ROOT_DIR/backend"
    cargo build --release
    cp "$ROOT_DIR/backend/target/release/kv-tidal" "$STAGE_DIR/package/bin/kv-tidal"
    cp -r "$ROOT_DIR/frontend/out/"* "$STAGE_DIR/package/web/"
fi

chmod +x "$STAGE_DIR/package/bin/kv-tidal"

echo "=== [2/4] Packaging package.tgz ==="
cd "$STAGE_DIR/package"
tar -czf "$STAGE_DIR/package.tgz" *

echo "=== [3/4] Adding Metadata, Icons & Lifecycle Scripts ==="
cd "$ROOT_DIR/spk"
cp INFO "$STAGE_DIR/INFO"
cp PACKAGE_ICON.PNG "$STAGE_DIR/PACKAGE_ICON.PNG"
cp PACKAGE_ICON_256.PNG "$STAGE_DIR/PACKAGE_ICON_256.PNG"
cp -r conf "$STAGE_DIR/conf"
cp -r scripts "$STAGE_DIR/scripts"
cp -r WIZARD_UIFILES "$STAGE_DIR/WIZARD_UIFILES"

echo "=== [4/4] Assembling Final Synology SPK Archives ==="
cd "$STAGE_DIR"
mkdir -p "$ROOT_DIR/dist"
SPK_DIST="$ROOT_DIR/dist/${PKG_NAME}_${ARCH}-${DSM_VER}_${VERSION}.spk"
rm -f "$SPK_DIST" "$ROOT_DIR/kv-tidal.spk" "$ROOT_DIR/kvtidal.spk"

tar -cf "$SPK_DIST" --format=gnu INFO conf scripts WIZARD_UIFILES PACKAGE_ICON.PNG PACKAGE_ICON_256.PNG package.tgz
cp "$SPK_DIST" "$ROOT_DIR/kv-tidal.spk"
cp "$SPK_DIST" "$ROOT_DIR/kvtidal.spk"

rm -rf "$STAGE_DIR"

echo "=========================================================="
echo " SUCCESS: Synology SPK package built at:"
echo "   $SPK_DIST"
echo "   $ROOT_DIR/kv-tidal.spk"
echo " Package Size: $(du -h "$SPK_DIST" | cut -f1)"
echo " Ready for manual install or spkrepo publishing!"
echo "=========================================================="
