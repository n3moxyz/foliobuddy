---
status: active
priority: p1
complexity: moderate
depends-on: []
---

# Close public PostgreSQL access

The database requires a password, but Docker publishes its connection port.
The backend and GitHub checks currently use that public route.

Use the existing private Docker network for the backend. Remove the database's
host port mapping in Coolify. Keep its persistent volume and exact image.
Use restricted SSH commands for GitHub checks and SSH for developer sync.
Host backups already use Docker directly.

- [x] Check live clients, jobs, backup transport, and database storage.
- [x] Add and test private paths for local sync and GitHub checks.
- [x] Prepare private configuration snapshots and rollback instructions.
- [ ] Obtain approval for the new PR before merging.
- [ ] Apply the backend address and Coolify database configuration.
- [ ] Verify external closure, app health, backups, and private clients.
- [ ] Document final evidence and remaining limits.

Do not change other applications, shared routing, or database contents.
Public files must contain generic configuration names only.

Preparation: six script regression tests passed. Shell syntax, workflow YAML,
embedded Python, formatting, and domain checks passed. The running backend can
reach the internal database name. Developer sync passed its connection-only check.
All three restricted operations passed. Shell commands and forwarding were denied.

The production port remains open. Uploading the dedicated key to GitHub requires
explicit approval. The supported Coolify settings page must also be accessible
before applying the final mapping change. No app or database restart has occurred.
