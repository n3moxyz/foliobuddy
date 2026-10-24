# Private PostgreSQL access

## Problem

Coolify has two independent controls for external database access:

- **Public access** starts a TCP proxy.
- **Ports Mappings** publishes a Docker port on the host.

Disabling the first control does not remove the second. A password protects database
authentication, but a published port still exposes PostgreSQL to external connections.
See [Coolify's database settings](https://coolify.io/docs/databases/configuration/general).

## Required state

- Backend `DATABASE_URL` uses the database's private Docker name.
- The database has no host port mappings and no public proxy.
- Backend and database share their existing private Docker network.
- The database keeps its volume and exact image digest.
- Developer sync uses existing SSH access.
- GitHub checks use a separate SSH key with a forced command.
- GitHub reaches that SSH endpoint through its scoped private network identity on `main`.
- Host backups continue to use `docker exec`.

## Prepare remote access

Install `scripts/private-db-read.sh` as `/usr/local/libexec/foliobuddy-db-read`.
Use root ownership and mode `0755`. Create `/etc/foliobuddy-db-access.conf`,
owned by root with mode `0600`:

```bash
DB_CONTAINER=production-postgres
```

Create a dedicated Ed25519 key. Add only its public key to root's `authorized_keys`:

```text
restrict,command="/usr/local/libexec/foliobuddy-db-read" ssh-ed25519 PUBLIC_KEY foliobuddy-database-checks
```

Preserve all existing keys. The `restrict` option disables forwarding, PTYs, agent
forwarding, and user startup scripts. The forced command rejects every operation
except `health`, `x-health`, and `owner`. It ignores client stdin and runs fixed SQL
with `default_transaction_read_only` enabled. Never add a general SQL or shell option.

Obtain the server's host key through an existing verified connection.
Do not trust a fresh unauthenticated `ssh-keyscan` result by itself.
With explicit approval, store the dedicated private key and connection settings
in the GitHub secrets listed in [DEPLOYMENT.md](../../DEPLOYMENT.md).
Never reuse an administrator's private key for CI.
The private network migration preserves this key and helper.
Its separate destination secrets and identity restrictions are in the [private CI runbook](2026-10-25-private-ci-access.md).

Test every allowed operation. Confirm that a shell command and a forwarding request fail.
Treat the `owner` response as sensitive. Print only whether a unique owner was found.
Deploy the workflow changes before closing the public database route.

## Apply the configuration

1. Save the database configuration, backend environment, container image, volume, and database system identifier in private operations notes.
2. Confirm the latest backup completed and its script uses the local container.
3. Verify the backend can connect through the database's internal Docker name.
4. Update only the hostname in the backend's `DATABASE_URL` through Coolify.
5. Apply the backend change and wait for its exact deployment to finish.
6. Check the full frontend-to-database health route.
7. In the database's General page, clear **Ports Mappings** and keep **Public access** disabled.
8. Pin the image to the currently running digest so the restart cannot upgrade PostgreSQL.
9. Save and restart the database through Coolify.
10. Verify the generated configuration, running container, data volume, and connections.

The database restart causes a brief connection interruption. Do not remove its volume.
Do not edit Docker or Coolify's internal database directly to bypass the saved settings.
Coolify's database API does not currently accept `ports_mappings`.
Use its supported General page for that setting.

## Verify

- External TCP connections to PostgreSQL fail over each configured public IP family.
- Docker has no published PostgreSQL port, including an IPv6 wildcard binding.
- Coolify's saved configuration and generated Compose file contain no host port mapping.
- The database is healthy, with the same volume, image, system identifier, and expected relations.
- `/health` and `/api/v1/health/db` on the backend return success.
- `https://foliobuddy.xyz/api/v1/health/db` returns HTTP 200 with `status: "ok"`.
- `npm run db:sync -- --check` succeeds without copying data.
- The GitHub production check passes through its restricted SSH command.
- Backup commands still use the preserved container and volume.

If the host has no public IPv6 address, record that limit. Still verify that Docker
removed its IPv6 wildcard listener. Do not claim an external IPv6 test occurred.

Run `npm run test:private-db` after script changes. It tests command rejection,
host verification, temporary-key cleanup, failed dumps, and transactional local restore.
Do not refresh a real local database merely to test connectivity.

## Rollback

Keep the private before-state beside the verification record.
If the backend fails, restore its previous environment through Coolify and apply it.
If the database cannot start, restore its prior image and port settings through Coolify,
then restart with the same volume. Restoring a public mapping reopens the exposure.
Use that rollback only when required to restore service, then resume the repair.

To remove the restricted SSH path, remove only its exact public-key line and helper.
Remove its GitHub secrets after the workflows no longer need them.
Do not replace the entire `authorized_keys` file with an old snapshot.
Other administrators may have added keys since that snapshot.

This repair does not change other applications, shared routing, SSH recovery access,
provider firewalls, or database records. It does not establish whether past misuse occurred.

## Verified rollout: 25 October 2026

PRs #65 and #66 merged with explicit approval. Backend commit `1871c60` deployed
successfully before the database restarted. External IPv4 connections to PostgreSQL
now fail. The saved mapping is empty, public access is disabled, and both the
generated Compose file and running container have no host port binding.

The database kept its image, volume, system identifier, and expected relation count.
The backend uses the private Docker hostname. All three HTTP health routes returned
`200` with `status: "ok"`. Developer sync passed its connection-only check. All three
restricted SSH operations and a discarded schema-only backup check passed.
The [production check after closure](https://github.com/n3moxyz/foliobuddy/actions/runs/40111407205)
passed on the deployed commit.

The host has no public IPv6 address. Its PostgreSQL IPv6 wildcard listener is gone,
but an external IPv6 check was not possible. Coolify still shows a pending-change
badge after restart. Saved settings, generated Compose, and live Docker state were
checked directly instead of treating that badge as deployment evidence. Gray port
numbers in the empty UI fields are placeholders.

The standalone image's separate dependency audit findings remain recorded in the
[build repair PR](https://github.com/n3moxyz/foliobuddy/pull/66). This database repair
does not change those dependency ranges. Private operations notes retain the
configuration snapshots, exact resource identifiers, and rollback evidence.
