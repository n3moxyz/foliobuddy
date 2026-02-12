#!/bin/bash
# Sync production database → local database
# Usage: npm run db:sync
#
# Requires PRODUCTION_DATABASE_URL in packages/backend/.env
# Local DB must be running (docker compose up -d)
#
# Uses `docker exec` so pg_dump/psql don't need to be installed locally.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/packages/backend/.env"
CONTAINER_NAME="pa-local-db"

# Read PRODUCTION_DATABASE_URL from .env
if [ -f "$ENV_FILE" ]; then
  PROD_URL=$(grep '^PRODUCTION_DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"')
fi

if [ -z "$PROD_URL" ]; then
  echo "Error: PRODUCTION_DATABASE_URL not found in packages/backend/.env"
  echo ""
  echo "Add this line to packages/backend/.env:"
  echo "PRODUCTION_DATABASE_URL=postgresql://user:pass@203.0.113.10:5432/dbname"
  exit 1
fi

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '${CONTAINER_NAME}' is not running."
  echo "Start it with: npm run db:local"
  exit 1
fi

# Inside the container, local DB is at localhost:5432 (not 5433)
LOCAL_URL="postgresql://dev:dev@localhost:5432/example_portfolio_db"

echo "Syncing production → local..."
echo "  From: production (DigitalOcean/Coolify)"
echo "  To:   local (${CONTAINER_NAME})"
echo ""

# Dump production and pipe into the container's psql
docker exec -i "$CONTAINER_NAME" pg_dump "$PROD_URL" --clean --if-exists --no-owner --no-privileges 2>/dev/null | \
  docker exec -i "$CONTAINER_NAME" psql "$LOCAL_URL" --quiet 2>/dev/null

echo "Done! Local database is now a copy of production."
echo "Local changes will NOT affect production."
