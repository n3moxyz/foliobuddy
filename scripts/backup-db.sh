#!/bin/bash
# Automated database backup to S3-compatible object storage
# Usage: ./scripts/backup-db.sh [daily|weekly|monthly]
#
# Run on the private database host (not locally). Uses docker exec so pg tools
# do not need to be installed on the host.
#
# Requires:
#   - s3cmd configured on the host
#   - Docker running with the Postgres container
#   - DB_CONTAINER, DB_NAME, DB_USER, and SPACES_BUCKET exported in the environment

set -euo pipefail

# Configuration lives in private ops environment, not in the public repo.
DB_CONTAINER="${DB_CONTAINER:?Set DB_CONTAINER to the Postgres container name}"
DB_NAME="${DB_NAME:?Set DB_NAME to the database name}"
DB_USER="${DB_USER:?Set DB_USER to the database user}"
SPACES_BUCKET="${SPACES_BUCKET:?Set SPACES_BUCKET to the private backup bucket URI}"
BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="example_portfolio_db_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"
TMP_DIR="/tmp/db-backups"

# Retention: how many backups to keep per type
DAILY_KEEP=7
WEEKLY_KEEP=4
MONTHLY_KEEP=12

mkdir -p "$TMP_DIR"

echo "[$(date)] Starting ${BACKUP_TYPE} backup..."

# Dump and compress
docker exec "$DB_CONTAINER" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip > "${TMP_DIR}/${BACKUP_FILE}"

FILESIZE=$(du -h "${TMP_DIR}/${BACKUP_FILE}" | cut -f1)
echo "  Dump created: ${FILESIZE}"

# Upload to Spaces
s3cmd put "${TMP_DIR}/${BACKUP_FILE}" "${SPACES_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}"
echo "  Uploaded to ${SPACES_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}"

# Clean up local temp file
rm -f "${TMP_DIR}/${BACKUP_FILE}"

# Apply retention policy
case "$BACKUP_TYPE" in
  daily)   KEEP=$DAILY_KEEP ;;
  weekly)  KEEP=$WEEKLY_KEEP ;;
  monthly) KEEP=$MONTHLY_KEEP ;;
  *)       echo "Unknown backup type: $BACKUP_TYPE"; exit 1 ;;
esac

EXISTING=$(s3cmd ls "${SPACES_BUCKET}/${BACKUP_TYPE}/" | awk '{print $4}' | sort)
COUNT=$(echo "$EXISTING" | grep -c . || true)

if [ "$COUNT" -gt "$KEEP" ]; then
  DELETE_COUNT=$((COUNT - KEEP))
  echo "  Pruning ${DELETE_COUNT} old backup(s)..."
  echo "$EXISTING" | head -n "$DELETE_COUNT" | while read -r file; do
    s3cmd del "$file"
    echo "    Deleted: $(basename "$file")"
  done
fi

echo "[$(date)] ${BACKUP_TYPE} backup complete."
