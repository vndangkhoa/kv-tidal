#!/usr/bin/env bash
# ==============================================================================
# KV-TIDAL: Studio-Grade Audiophile Music Platform
# Universal Launch & Control Script
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

PID_FILE="$ROOT_DIR/data/kv-tidal.pid"
LOG_FILE="$ROOT_DIR/data/kv-tidal.log"
CONFIG_FILE="$ROOT_DIR/data/config.json"
BINARY="$ROOT_DIR/backend/target/release/kv-tidal"
WEB_DIR="$ROOT_DIR/frontend/out"

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

get_pid() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      echo "$PID"
      return 0
    fi
  fi
  pgrep -f "kv-tidal" 2>/dev/null | head -n1 || true
}

is_running() {
  PID=$(get_pid)
  [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null
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
  echo -e "${YELLOW}Stopping KV-Tidal...${NC}"
  
  # Check PID file first
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill -15 "$PID" 2>/dev/null || true
      for i in {1..10}; do
        if ! kill -0 "$PID" 2>/dev/null; then
          break
        fi
        sleep 0.5
      done
      if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi

  # Kill any remaining instances
  REMAINING=$(pgrep -f "kv-tidal" 2>/dev/null || true)
  if [ -n "$REMAINING" ]; then
    kill -9 $REMAINING 2>/dev/null || true
  fi

  echo -e "${GREEN}✓ KV-Tidal stopped.${NC}"
}

do_start() {
  if is_running; then
    PID=$(get_pid)
    echo -e "${YELLOW}KV-Tidal is already running (PID: $PID) on port $PORT.${NC}"
    echo -e "Use: ${BOLD}$0 restart${NC} to reload, or ${BOLD}$0 stop${NC} to terminate."
    return 0
  fi

  # Ensure binary and web assets exist
  if [ ! -f "$BINARY" ] || [ ! -d "$WEB_DIR" ]; then
    echo -e "${YELLOW}Release binary or web assets not found. Triggering automatic build...${NC}"
    do_build
  fi

  # Ensure data and music directories exist
  mkdir -p "$ROOT_DIR/data"
  mkdir -p "$ROOT_DIR/music"

  # Export runtime environment
  export PORT="$PORT"
  export HOST="$HOST"
  export WEB_DIR="$WEB_DIR"
  export DATA_DIR="$ROOT_DIR/data"
  export MUSIC_DIR="$ROOT_DIR/music"
  export CONFIG_PATH="$ROOT_DIR/data/config.json"

  LAN_IP=$(get_lan_ip)

  if [ "$FOREGROUND" = true ]; then
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "${BOLD}${GREEN}  KV-TIDAL: Studio-Grade Audiophile Server (Foreground)${NC}"
    echo -e "${CYAN}=================================================================${NC}"
    echo -e "  • Web Interface:    ${CYAN}http://localhost:${PORT}${NC} or ${CYAN}http://${LAN_IP}:${PORT}${NC}"
    echo -e "  • OpenSubsonic API: ${CYAN}http://${LAN_IP}:${PORT}/rest${NC}"
    echo -e "  • Audio Engine:     Bit-Perfect FLAC / 24-bit 192kHz / Web Audio DSP"
    echo -e "${CYAN}=================================================================${NC}\n"
    exec "$BINARY"
  else
    echo -e "${CYAN}Starting KV-Tidal background daemon...${NC}"
    setsid "$BINARY" </dev/null > "$LOG_FILE" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"

    # Wait 1.5s and verify it launched
    sleep 1.5
    if kill -0 "$PID" 2>/dev/null; then
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
    else
      echo -e "${RED}✗ KV-Tidal failed to start. Last log output:${NC}"
      tail -n 20 "$LOG_FILE"
      exit 1
    fi
  fi
}

do_status() {
  if is_running; then
    PID=$(get_pid)
    LAN_IP=$(get_lan_ip)
    echo -e "${GREEN}● KV-Tidal is RUNNING${NC} (PID: ${BOLD}$PID${NC})"
    echo -e "  • Port:             ${PORT}"
    echo -e "  • Web Dashboard:    ${CYAN}http://localhost:${PORT}${NC} (or http://${LAN_IP}:${PORT})"
    echo -e "  • OpenSubsonic:     ${CYAN}http://${LAN_IP}:${PORT}/rest${NC}"
    if ps -p "$PID" -o %cpu,%mem,rss,etime --no-headers >/dev/null 2>&1; then
      echo -n "  • Resources:        "
      ps -p "$PID" -o %cpu,%mem,rss,etime --no-headers | awk '{printf "CPU: %s%% | Memory: %s%% (RSS: %d MB) | Uptime: %s\n", $1, $2, $3/1024, $4}'
    fi
  else
    echo -e "${YELLOW}○ KV-Tidal is NOT running.${NC}"
    echo -e "Run ${BOLD}$0 start${NC} to launch."
  fi
}

do_logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -f "$LOG_FILE"
  else
    echo -e "${YELLOW}No log file found at $LOG_FILE${NC}"
  fi
}

# --- CLI Dispatcher ---
COMMAND="${1:-start}"
FOREGROUND=false

case "$COMMAND" in
  start)
    if [ "$2" = "-f" ] || [ "$2" = "--foreground" ]; then
      FOREGROUND=true
    fi
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
  build)
    do_build
    ;;
  -f|--foreground)
    FOREGROUND=true
    do_start
    ;;
  help|--help|-h)
    echo -e "${BOLD}Usage:${NC} $0 {start|stop|restart|status|logs|build} [-f|--foreground]"
    echo ""
    echo "Commands:"
    echo "  start       Launch KV-Tidal in background (daemon mode)"
    echo "  start -f    Launch KV-Tidal in foreground (interactive output)"
    echo "  stop        Gracefully stop running server"
    echo "  restart     Stop and restart server"
    echo "  status      Display server status, memory usage, and URLs"
    echo "  logs        Stream real-time server logs"
    echo "  build       Recompile frontend static assets and backend release binary"
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}"
    echo "Usage: $0 {start|stop|restart|status|logs|build} [-f]"
    exit 1
    ;;
esac
