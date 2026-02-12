#!/bin/bash
# Sync production database → local database
# Usage: npm run db:sync
#
# Requires PRODUCTION_DATABASE_URL in packages/backend/.env
# Local DB must be running (docker compose up -d)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/packages/backend/.env"

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

LOCAL_URL="postgresql://dev:dev@localhost:5433/example_portfolio_db"

echo "Syncing production → local..."
echo "  From: production (DigitalOcean/Coolify)"
echo "  To:   local (localhost:5433)"
echo ""

# Dump production and restore to local in one pipeline
pg_dump "$PROD_URL" --clean --if-exists --no-owner --no-privileges 2>/dev/null | \
  psql "$LOCAL_URL" --quiet 2>/dev/null

echo "Done! Local database is now a copy of production."
echo "Local changes will NOT affect production."
