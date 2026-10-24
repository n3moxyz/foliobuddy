#!/usr/bin/env bash
# Keep the existing entry point. Node handles private SSH access and safe restore.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/sync-db.mjs" "$@"
