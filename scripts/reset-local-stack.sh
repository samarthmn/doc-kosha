#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.r2.yml"

YES=0
SKIP_SUPABASE=0
SKIP_MINIO=0

usage() {
  cat <<'EOF'
Reset local development dependencies for DocKosha.

This script can:
1) Reset local Supabase DB (migrations + seed)
2) Wipe and recreate local MinIO storage

Usage:
  sh scripts/reset-local-stack.sh [options]

Options:
  --yes                Skip confirmation prompt
  --skip-supabase      Do not reset Supabase
  --skip-minio         Do not reset MinIO
  -h, --help           Show this help
EOF
}

log() {
  printf '[reset-local] %s\n' "$1"
}

warn() {
  printf '[reset-local][warn] %s\n' "$1" >&2
}

run_cmd() {
  log "Running: $*"
  "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf '[reset-local][error] Missing required command: %s\n' "$cmd" >&2
    exit 1
  fi
}

while (($# > 0)); do
  case "$1" in
    --yes)
      YES=1
      ;;
    --skip-supabase)
      SKIP_SUPABASE=1
      ;;
    --skip-minio)
      SKIP_MINIO=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf '[reset-local][error] Unknown option: %s\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ "$YES" -ne 1 ]]; then
  cat <<'EOF'
This will:
- reset local Supabase DB
- delete local MinIO data volume and recreate bucket
EOF
  read -r -p "Continue? [y/N] " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    log "Cancelled."
    exit 0
  fi
fi

if [[ "$SKIP_SUPABASE" -ne 1 ]]; then
  require_cmd supabase
  log "Resetting Supabase local DB..."
  run_cmd supabase start
  run_cmd supabase db reset --local
else
  log "Skipping Supabase reset."
fi

if [[ "$SKIP_MINIO" -ne 1 ]]; then
  require_cmd docker
  log "Resetting MinIO volume and bucket..."
  run_cmd docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
  run_cmd docker compose -f "$COMPOSE_FILE" up -d
else
  log "Skipping MinIO reset."
fi

log "Local reset complete."
