#!/usr/bin/env bash
# ==============================================================================
# KV-TIDAL: Studio-Grade Audiophile Music Platform
# Universal Launch & Control Script
# ==============================================================================

if [ -z "$BASH_VERSION" ]; then
  exec bash "$0" "$@"
fi

set -e

# Canonical root directory resolution (works even through symlinks)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
cd "$ROOT_DIR"

PID_FILE="$ROOT_DIR/data/kv-tidal.pid"
LOG_FILE="$ROOT_DIR/data/kv-tidal.log"
CONFIG_FILE="$ROOT_DIR/data/config.json"
BINARY="$ROOT_DIR/backend/target/release/kv-tidal"
WEB_DIR="$ROOT_DIR/frontend/out"
SLSKD_BINARY="$ROOT_DIR/spk/bin/slskd"
SLSKD_PID_FILE="$ROOT_DIR/data/slskd.pid"
SLSKD_LOG_FILE="$ROOT_DIR/data/slskd/slskd.log"
SLSKD_PORT=5030

# Default port (fallback to 8090 if 8080 is reserved)
DEFAULT_PORT=8090
if [ -f "$CONFIG_FILE" ]; then
  CONFIG_PORT=$(grep -o '"port":[ ]*[0-9]*' "$CONFIG_FILE" 2>/dev/null | tr -dc '0-9' || true)
fi
PORT="${PORT:-${CONFIG_PORT:-$DEFAULT_PORT}}"
HOST="${HOST:-0.0.0.0}"

# ANSI Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

get_lan_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

open_browser() {
  if [ "$NO_BROWSER" = true ]; then
    return 0
  fi
  local url="http://localhost:${PORT}"
  if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    echo -e "${CYAN}--> Opening Web Dashboard in default browser (${url})...${NC}\n"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$url" >/dev/null 2>&1 &
    elif command -v gio >/dev/null 2>&1; then
      gio open "$url" >/dev/null 2>&1 &
    fi
  fi
}

get_pid() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      local comm
      comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ' || true)
      if [ "$comm" = "kv-tidal" ]; then
        echo "$pid"
        return 0
      fi
    fi
    # If PID file contains a dead or non-kv-tidal process, remove it
    rm -f "$PID_FILE"
  fi
  # Fallback to exact process name match (exclude terminal, editor, or subshell commands)
  pgrep -x "kv-tidal" 2>/dev/null | head -n1 || true
}

is_running() {
  local pid
  pid=$(get_pid)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    local comm
    comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ' || true)
    [ "$comm" = "kv-tidal" ]
  else
    return 1
  fi
}

get_slskd_pid() {
  if [ -f "$SLSKD_PID_FILE" ]; then
    local spid
    spid=$(cat "$SLSKD_PID_FILE" 2>/dev/null || true)
    if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then
      local stat
      stat=$(ps -p "$spid" -o stat= 2>/dev/null || true)
      if [ -n "$stat" ] && [[ "$stat" != *"Z"* ]]; then
        local comm
        comm=$(ps -p "$spid" -o comm= 2>/dev/null | tr -d ' ' || true)
        if [ "$comm" = "slskd" ]; then
          echo "$spid"
          return 0
        fi
      fi
    fi
    rm -f "$SLSKD_PID_FILE"
  fi
  for p in $(pgrep -x "slskd" 2>/dev/null || true); do
    local stat
    stat=$(ps -p "$p" -o stat= 2>/dev/null || true)
    if [ -n "$stat" ] && [[ "$stat" != *"Z"* ]]; then
      echo "$p"
      return 0
    fi
  done
}

is_slskd_running() {
  local spid
  spid=$(get_slskd_pid)
  if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

start_slskd() {
  if [ -x "$SLSKD_BINARY" ]; then
    if is_slskd_running; then
      return 0
    fi

    # Ensure wwwroot relative symlink is valid
    if [ ! -e "$ROOT_DIR/spk/bin/wwwroot" ] && [ -d "$ROOT_DIR/spk/share/slskd/wwwroot" ]; then
      ln -sfn ../share/slskd/wwwroot "$ROOT_DIR/spk/bin/wwwroot"
    fi

    mkdir -p "$ROOT_DIR/data/slskd" "$ROOT_DIR/data/slskd/incomplete" "$ROOT_DIR/music"
    export SLSKD_APP_DIR="$ROOT_DIR/data/slskd"
    export SLSKD_CONFIG="$ROOT_DIR/data/slskd/slskd.yml"
    export SLSKD_NO_AUTH="true"
    export SLSKD_NO_HTTPS="true"
    export SLSKD_NO_VERSION_CHECK="true"
    export SLSKD_NO_COLOR="true"

    setsid "$SLSKD_BINARY" --no-https </dev/null >> "$SLSKD_LOG_FILE" 2>&1 &
    local spid=$!
    echo "$spid" > "$SLSKD_PID_FILE"
    echo -e "${GREEN}✓ Soulseek P2P Daemon (slskd) started (PID: $spid, Port: $SLSKD_PORT)${NC}"
  fi
}

stop_slskd() {
  local spid
  spid=$(get_slskd_pid)
  if [ -n "$spid" ]; then
    kill -15 "$spid" 2>/dev/null || true
    for i in {1..6}; do
      if ! kill -0 "$spid" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$spid" 2>/dev/null; then
      kill -9 "$spid" 2>/dev/null || true
    fi
  fi
  rm -f "$SLSKD_PID_FILE"

  local remaining
  remaining=$(pgrep -x "slskd" 2>/dev/null || true)
  if [ -n "$remaining" ]; then
    kill -9 $remaining 2>/dev/null || true
  fi
  echo -e "${GREEN}✓ Soulseek daemon (slskd) stopped.${NC}"
}

is_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tulpn 2>/dev/null | grep -q ":${port} "
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i :"$port" >/dev/null 2>&1
  else
    return 1
  fi
}

do_build() {
  echo -e "${CYAN}=== Building KV-Tidal Audiophile Platform ===${NC}"
  
  echo -e "${YELLOW}--> [1/2] Building Next.js 15 Frontend (with Web Audio DSP & EQ)...${NC}"
  cd "$ROOT_DIR/frontend"
  npm run build
  
  echo -e "${YELLOW}--> [2/2] Building Optimized Rust Release Engine...${NC}"
  cd "$ROOT_DIR/backend"
  cargo build --release
  
  echo -e "${GREEN}✓ Build completed successfully!${NC}"
  cd "$ROOT_DIR"
}

do_stop() {
  echo -e "${YELLOW}Stopping KV-Tidal & background engines...${NC}"
  stop_slskd

  local pid
  pid=$(get_pid)
  
  if [ -n "$pid" ]; then
    kill -15 "$pid" 2>/dev/null || true
    for i in {1..10}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"

  # Terminate any remaining instances (strictly exact binary match)
  local remaining
  remaining=$(pgrep -x "kv-tidal" 2>/dev/null || true)
  if [ -n "$remaining" ]; then
    kill -9 $remaining 2>/dev/null || true
  fi

  echo -e "${GREEN}✓ KV-Tidal stopped.${NC}"
}

do_start() {
  start_slskd
  if is_running; then
    local pid
    pid=$(get_pid)
    LAN_IP=$(get_lan_ip)
    local spid
    spid=$(get_slskd_pid)
    echo -e "${GREEN}● KV-Tidal is already running and online! (PID: $pid)${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "${BOLD}${GREEN}  KV-TIDAL AUDIOPHILE PLATFORM IS ONLINE${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "  • Web Dashboard:    ${BOLD}${CYAN}http://localhost:${PORT}${NC}  (or http://${LAN_IP}:${PORT})"
    echo -e "  • OpenSubsonic API: ${BOLD}${CYAN}http://${LAN_IP}:${PORT}/rest${NC}"
    echo -e "  • Subsonic Auth:    User: ${BOLD}admin${NC} | Pass: ${BOLD}admin${NC}"
    if [ -n "$spid" ]; then
      echo -e "  • Soulseek Daemon:  Port ${SLSKD_PORT} (PID: ${spid})"
    fi
    echo -e "  • Logs:             ${LOG_FILE}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "Commands: ${BOLD}$0 restart${NC} | ${BOLD}$0 stop${NC} | ${BOLD}$0 status${NC} | ${BOLD}$0 logs${NC}\n"
    open_browser
    return 0
  fi

  # Check if desired port is already occupied by an unrelated service
  if is_port_in_use "$PORT"; then
    echo -e "${RED}✗ Error: Port $PORT is already in use by another application.${NC}"
    if command -v ss >/dev/null 2>&1; then
      ss -tulpn 2>/dev/null | grep ":${PORT} " || true
    fi
    echo -e "Please stop the conflicting process or set PORT=<port> $0 start"
    exit 1
  fi

  # Ensure binary and web assets exist
  if [ ! -f "$BINARY" ] || [ ! -f "$WEB_DIR/index.html" ]; then
    echo -e "${YELLOW}Release binary or web assets not found. Triggering automatic build...${NC}"
    do_build
  fi

  # Make sure binary is executable
  chmod +x "$BINARY" 2>/dev/null || true

  # Ensure data and music directories exist
  mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/data/tmp"
  mkdir -p "$ROOT_DIR/music"

  # Clean up stale PID file if present
  rm -f "$PID_FILE"

  # Export runtime environment
  export PORT="$PORT"
  export HOST="$HOST"
  export WEB_DIR="$WEB_DIR"
  export DATA_DIR="$ROOT_DIR/data"
  export MUSIC_DIR="$ROOT_DIR/music"
  export CONFIG_PATH="$CONFIG_FILE"
  export TMPDIR="$ROOT_DIR/data/tmp"

  if [ -x "$ROOT_DIR/spk/bin/yt-dlp_linux" ]; then
    export YT_DLP_PATH="$ROOT_DIR/spk/bin/yt-dlp_linux"
  elif [ -x "$ROOT_DIR/spk/bin/yt-dlp" ]; then
    export YT_DLP_PATH="$ROOT_DIR/spk/bin/yt-dlp"
  elif command -v yt-dlp >/dev/null 2>&1; then
    export YT_DLP_PATH="$(command -v yt-dlp)"
  fi

  LAN_IP=$(get_lan_ip)

  if [ "$FOREGROUND" = true ]; then
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "${BOLD}${GREEN}  KV-TIDAL: Studio-Grade Audiophile Server (Foreground)${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "  • Web Interface:    ${CYAN}http://localhost:${PORT}${NC} or ${CYAN}http://${LAN_IP}:${PORT}${NC}"
    echo -e "  • OpenSubsonic API: ${CYAN}http://${LAN_IP}:${PORT}/rest${NC}"
    echo -e "  • Audio Engine:     Bit-Perfect FLAC / 24-bit 192kHz / Web Audio DSP"
    echo -e "${CYAN}=================================================================${NC}\n"
    open_browser
    echo "$$" > "$PID_FILE"
    exec "$BINARY"
  else
    echo -e "${CYAN}Starting KV-Tidal background daemon...${NC}"
    setsid "$BINARY" </dev/null >> "$LOG_FILE" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"

    # Wait up to 3s and verify healthy startup
    local running=false
    for i in {1..6}; do
      sleep 0.5
      if kill -0 "$PID" 2>/dev/null && [ "$(ps -p "$PID" -o comm= 2>/dev/null | tr -d ' ')" = "kv-tidal" ]; then
        running=true
        break
      fi
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi
    done

    if [ "$running" = true ]; then
      echo -e "${GREEN}✓ KV-Tidal launched successfully! (PID: $PID)${NC}"
      echo -e "${CYAN}=================================================================${NC}"
      echo -e "${BOLD}${GREEN}  KV-TIDAL AUDIOPHILE PLATFORM IS ONLINE${NC}"
      echo -e "${CYAN}=================================================================${NC}"
      echo -e "  • Web Dashboard:    ${BOLD}${CYAN}http://localhost:${PORT}${NC}  (or http://${LAN_IP}:${PORT})"
      echo -e "  • OpenSubsonic API: ${BOLD}${CYAN}http://${LAN_IP}:${PORT}/rest${NC}"
      echo -e "  • Subsonic Auth:    User: ${BOLD}admin${NC} | Pass: ${BOLD}admin${NC}"
      echo -e "  • Logs:             ${LOG_FILE}"
      echo -e "${CYAN}=================================================================${NC}"
      echo -e "Commands: ${BOLD}$0 status${NC} | ${BOLD}$0 logs${NC} | ${BOLD}$0 stop${NC} | ${BOLD}$0 restart${NC}\n"
      open_browser
    else
      echo -e "${RED}✗ KV-Tidal failed to start. Last log output:${NC}"
      tail -n 25 "$LOG_FILE" 2>/dev/null || true
      rm -f "$PID_FILE"
      exit 1
    fi
  fi
}

do_status() {
  if is_running; then
    local pid
    pid=$(get_pid)
    LAN_IP=$(get_lan_ip)
    local detected_port
    if command -v ss >/dev/null 2>&1; then
      detected_port=$(ss -tulpn 2>/dev/null | grep "pid=$pid," | awk '{print $5}' | awk -F: '{print $NF}' | head -n1 || true)
    fi
    local display_port="${detected_port:-$PORT}"

    echo -e "${GREEN}● KV-Tidal is RUNNING${NC} (PID: ${BOLD}$pid${NC})"
    echo -e "  • Port:             ${display_port}"
    echo -e "  • Web Dashboard:    ${CYAN}http://localhost:${display_port}${NC} (or http://${LAN_IP}:${display_port})"
    echo -e "  • OpenSubsonic:     ${CYAN}http://${LAN_IP}:${display_port}/rest${NC}"
    if ps -p "$pid" -o %cpu,%mem,rss,etime --no-headers >/dev/null 2>&1; then
      echo -n "  • Resources:        "
      ps -p "$pid" -o %cpu,%mem,rss,etime --no-headers | awk '{printf "CPU: %s%% | Memory: %s%% (RSS: %d MB) | Uptime: %s\n", $1, $2, $3/1024, $4}'
    fi
  else
    echo -e "${YELLOW}○ KV-Tidal is NOT running.${NC}"
    echo -e "Run ${BOLD}$0 start${NC} to launch."
  fi

  if is_slskd_running; then
    local spid
    spid=$(get_slskd_pid)
    echo -e "${GREEN}● Soulseek P2P Daemon (slskd) is RUNNING${NC} (PID: ${BOLD}$spid${NC}, Port: $SLSKD_PORT)"
  else
    echo -e "${YELLOW}○ Soulseek P2P Daemon (slskd) is NOT running.${NC}"
  fi
}

do_logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -f -n 50 "$LOG_FILE"
  else
    echo -e "${YELLOW}No log file found at $LOG_FILE${NC}"
  fi
}

# --- CLI Dispatcher ---
COMMAND="${1:-start}"
FOREGROUND=false
NO_BROWSER=false

for arg in "$@"; do
  case "$arg" in
    -f|--foreground)
      FOREGROUND=true
      ;;
    -n|--no-browser)
      NO_BROWSER=true
      ;;
  esac
done

case "$COMMAND" in
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  restart)
    do_stop
    sleep 1
    do_start
    ;;
  status)
    do_status
    ;;
  logs)
    do_logs
    ;;
  open)
    open_browser
    ;;
  build)
    do_build
    ;;
  -f|--foreground)
    FOREGROUND=true
    do_start
    ;;
  -n|--no-browser)
    NO_BROWSER=true
    do_start
    ;;
  help|--help|-h)
    echo -e "${BOLD}Usage:${NC} $0 {start|stop|restart|status|logs|open|build} [-f|--foreground] [-n|--no-browser]"
    echo ""
    echo "Commands:"
    echo "  start       Launch KV-Tidal (or bring up browser if already running)"
    echo "  start -f    Launch KV-Tidal in foreground (interactive output)"
    echo "  stop        Gracefully stop running server"
    echo "  restart     Stop and restart server"
    echo "  open        Open Web Dashboard in default browser"
    echo "  status      Display server status, memory usage, and URLs"
    echo "  logs        Stream real-time server logs"
    echo "  build       Recompile frontend static assets and backend release binary"
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    echo "Usage: $0 {start|stop|restart|status|logs|open|build} [-f] [-n]"
    exit 1
    ;;
esac

