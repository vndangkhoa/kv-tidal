#!/bin/sh
set -e

# Start background slskd Soulseek daemon if enabled
if [ "${SOULSEEK_ENABLED:-true}" = "true" ] && [ -x /usr/local/bin/slskd ]; then
    mkdir -p "${DATA_DIR:-/data}/slskd" "${DATA_DIR:-/data}/slskd/incomplete" "${MUSIC_DIR:-/music}"
    [ ! -e /usr/local/bin/wwwroot ] && [ -d /app/share/slskd/wwwroot ] && ln -sfn /app/share/slskd/wwwroot /usr/local/bin/wwwroot
    export SLSKD_APP_DIR="${DATA_DIR:-/data}/slskd"
    export SLSKD_CONFIG="${DATA_DIR:-/data}/slskd/slskd.yml"
    export SLSKD_NO_AUTH="true"
    export SLSKD_NO_VERSION_CHECK="true"
    export SLSKD_NO_COLOR="true"
    export SLSKD_NO_HTTPS="true"
    if [ -n "$SOULSEEK_USERNAME" ]; then
        export SLSKD_SLSK_USERNAME="$SOULSEEK_USERNAME"
    fi
    if [ -n "$SOULSEEK_PASSWORD" ]; then
        export SLSKD_SLSK_PASSWORD="$SOULSEEK_PASSWORD"
    fi
    /usr/local/bin/slskd --no-https >> "${DATA_DIR:-/data}/slskd/slskd.log" 2>&1 &
fi

exec /app/kv-tidal "$@"
