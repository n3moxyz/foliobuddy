#!/bin/bash
# Restore database from a DigitalOcean Spaces backup
# Usage: ./scripts/restore-db.sh [backup-path]
#
# Examples:
#   ./scripts/restore-db.sh                                              # List available backups
#   ./scripts/restore-db.sh daily/pa_portfolio_daily_20260227_020000.sql.gz  # Restore specific backup
#
# Run on the DO droplet. Uses docker exec for psql.

set -euo pipefail

DB_CONTAINER="ykgckwckk8gc8kowwkgg4cc0"
DB_NAME="pa_portfolio"
DB_USER="pa_user"
SPACES_BUCKET="s3://pa-portfolio-backups"
TMP_DIR="/tmp/db-backups"

mkdir -p "$TMP_DIR"

# No argument: list available backups
if [ -z "${1:-}" ]; then
  echo "Available backups:"
  echo ""
  for type in daily weekly monthly; do
    echo "=== ${type} ==="
    s3cmd ls "${SPACES_BUCKET}/${type}/" 2>/dev/null | awk '{print $3, $4}' | sed "s|${SPACES_BUCKET}/||" || echo "  (none)"
    echo ""
  done
  echo "Usage: $0 <path>"
  echo "  e.g.: $0 daily/pa_portfolio_daily_20260227_020000.sql.gz"
  exit 0
fi

BACKUP_PATH="$1"
BACKUP_FILE=$(basename "$BACKUP_PATH")

echo "WARNING: This will REPLACE the '${DB_NAME}' database with the backup."
echo "  Source: ${SPACES_BUCKET}/${BACKUP_PATH}"
echo ""
read -p "Type 'yes' to confirm: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "Downloading backup..."
s3cmd get "${SPACES_BUCKET}/${BACKUP_PATH}" "${TMP_DIR}/${BACKUP_FILE}"

echo "Restoring database..."
gunzip -c "${TMP_DIR}/${BACKUP_FILE}" | docker exec -i "$DB_CONTAINER" psql \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --quiet

rm -f "${TMP_DIR}/${BACKUP_FILE}"

echo "Restore complete! You may want to restart the backend container to clear caches."
