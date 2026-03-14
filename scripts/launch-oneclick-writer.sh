#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$ROOT_DIR/.local/node/bin"
export PATH="$NODE_BIN:$PATH"

APP_URL="${ONECLICK_WRITER_URL:-http://127.0.0.1:8787}"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/server.pid"
LOG_FILE="$RUNTIME_DIR/server.log"

mkdir -p "$RUNTIME_DIR"

if [[ ! -x "$NODE_BIN/node" ]]; then
  osascript -e 'display dialog "로컬 Node.js가 없습니다. 먼저 앱 폴더에서 초기 설정이 필요합니다." buttons {"확인"} default button "확인" with icon stop'
  exit 1
fi

is_server_ready() {
  curl -fsS "$APP_URL/api/health" >/dev/null 2>&1
}

cleanup_stale_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local existing_pid
    existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && ! kill -0 "$existing_pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
    fi
  fi
}

start_server() {
  cleanup_stale_pid

  if is_server_ready; then
    return 0
  fi

  (
    cd "$ROOT_DIR"
    nohup "$NODE_BIN/node" server.js >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )

  local tries=0
  until is_server_ready; do
    tries=$((tries + 1))
    if [[ $tries -ge 30 ]]; then
      osascript -e "display dialog \"서버 실행에 실패했습니다.\n로그: $LOG_FILE\" buttons {\"확인\"} default button \"확인\" with icon stop"
      exit 1
    fi
    sleep 1
  done
}

start_server
open "$APP_URL"
