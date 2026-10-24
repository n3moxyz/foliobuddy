---
status: complete
priority: p1
complexity: moderate
depends-on: []
---

# Close public PostgreSQL access

Docker published the database connection port, despite Coolify's disabled public-access switch.
The backend and GitHub checks used that public route.

Use the existing private Docker network for the backend. Remove the database's
host port mapping in Coolify. Keep its persistent volume and exact image.
Use restricted SSH commands for GitHub checks and SSH for developer sync.
Host backups already use Docker directly.

- [x] Check live clients, jobs, backup transport, and database storage.
- [x] Add and test private paths for local sync and GitHub checks.
- [x] Prepare private configuration snapshots and rollback instructions.
- [x] Obtain approval for the new PR before merging.
- [x] Apply the backend address and Coolify database configuration.
- [x] Verify external closure, app health, backups, and private clients.
- [x] Document final evidence and remaining limits.

Do not change other applications, shared routing, or database contents.
Public files must contain generic configuration names only.

Preparation: six script regression tests passed. Shell syntax, workflow YAML,
embedded Python, formatting, and domain checks passed. The running backend can
reach the internal database name. Developer sync passed its connection-only check.
All three restricted operations passed. Shell commands and forwarding were denied.

Completed on 25 October 2026, Singapore time. PRs #65 and #66 merged with explicit
approval. The exact backend deployment completed before the database restarted.
External IPv4 connections now fail. Saved settings, generated Compose, and Docker
all have no published PostgreSQL port. The original volume, image, database system
identifier, and expected relation count are preserved.

All three HTTP health routes, developer sync's connection-only check, restricted
SSH operations, and a discarded schema-only backup check passed. The
[GitHub production check](https://github.com/n3moxyz/foliobuddy/actions/runs/40111407205)
also passed after closure.

No public IPv6 address is configured. The IPv6 wildcard listener is gone, but no
external IPv6 test occurred. Coolify still displays a pending-change badge despite
matching saved and live settings. Separate dependency audit findings remain outside
this repair. See the [runbook](../../docs/solutions/2026-10-24-private-postgres-access.md).
