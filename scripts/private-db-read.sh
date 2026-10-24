#!/usr/bin/env bash
# Install on the database host as a root-owned SSH forced command.
# The CI key can run only these fixed, read-only queries. It cannot open a shell.
set -euo pipefail

case "${SSH_ORIGINAL_COMMAND:-}" in
  health)
    query="SELECT json_build_object('ok', true);"
    ;;
  x-health)
    query=$(cat <<'SQL'
SELECT json_build_object(
  'migrated', (SELECT COUNT(*) FROM _prisma_migrations
    WHERE migration_name = '20260927000000_add_x_posts' AND finished_at IS NOT NULL),
  'total', COUNT(*),
  'last_hour', COUNT(*) FILTER (WHERE "collectedAt" > now() - interval '1 hour'),
  'last_day', COUNT(*) FILTER (WHERE "collectedAt" > now() - interval '24 hours'),
  'accounts', COUNT(DISTINCT "authorKey"),
  'collected_min', (EXTRACT(EPOCH FROM now() - MAX("collectedAt")) / 60)::int,
  'posted_min', (EXTRACT(EPOCH FROM now() - MAX("postedAt")) / 60)::int
) FROM "XPost";
SQL
    )
    ;;
  owner)
    query=$(cat <<'SQL'
WITH candidates AS (
  SELECT "userId", COUNT(*)::int AS position_count
  FROM "Position" WHERE "custodyOf" IS NULL
  GROUP BY "userId"
  HAVING COUNT(*) >= 10 AND COALESCE(SUM(COALESCE("marketValueUsd", 0)), 0) >= 100000
)
SELECT json_build_object(
  'candidate_count', COUNT(*),
  'owner_id', CASE WHEN COUNT(*) = 1 THEN MIN("userId") END,
  'position_count', CASE WHEN COUNT(*) = 1 THEN MIN(position_count) END
) FROM candidates;
SQL
    )
    ;;
  *)
    echo 'Unsupported database check.' >&2
    exit 64
    ;;
esac

# This file contains only the private container name. It must be root-owned.
source /etc/foliobuddy-db-access.conf
: "${DB_CONTAINER:?Configure DB_CONTAINER on the database host}"

printf 'SET default_transaction_read_only = on;\n%s\n' "$query" |
  docker exec -i "$DB_CONTAINER" sh -c \
    'exec psql -XqAt --set ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
