# Private CI administration

## Problem

Deployment and production checks need Coolify HTTPS and restricted SSH access.
Closing public administration ports before replacing those routes would break the workflows.
The database itself remains private throughout this migration.

## Identity restrictions

Create one Tailscale federated identity for each workflow listed in DEPLOYMENT.md.
Use these exact constraints:

- Issuer: `https://token.actions.githubusercontent.com`.
- Subject: `repo:n3moxyz/foliobuddy:ref:refs/heads/main`.
- Custom claim `repository_id`: this repository's immutable GitHub ID, verified through the GitHub API.
- Custom claim `workflow_ref`: `n3moxyz/foliobuddy/.github/workflows/WORKFLOW.yml@refs/heads/main`, with the exact filename for that identity.
- Permission: write auth keys for `tag:ci-foliobuddy` only.

Do not use wildcard repositories, branches, or workflow paths.
Do not grant policy editing, device administration, or personal-device access.
The tailnet policy must allow the CI tag to reach only the production VPS on TCP 22 and 443.
The production VPS must have no permission to initiate connections to personal devices.

The workflows require `contents: read` and job-level `id-token: write`.
They reject manual runs on feature branches and never run on pull-request events.
Production Check also rejects failed upstream runs and upstream runs outside this repository's `main` branch.

The action creates an ephemeral node, stores its state in memory, and logs out during job cleanup.
The pinned action adds `--accept-routes` itself. Passing `--accept-routes=false` in its `args` repeats the flag and Tailscale 1.104.2 rejects startup.
Keep DNS replacement and Tailscale SSH disabled in `args`. Immediately after the action, use `tailscale set --accept-routes=false`.
Before any production step, verify route acceptance, DNS replacement, and Tailscale SSH are all disabled.
The CI tag remains limited to VPS TCP 22/443 throughout enrollment. No subnet route is granted.
The VPS uses ordinary OpenSSH so its forced command and host-key checks remain effective.

## Prepare and cut over

1. Verify the database has no host port mapping and the application still works.
2. Enroll the isolated VPS and verify private SSH from both approved administrator devices.
3. Verify private Coolify HTTPS with its valid certificate, terminal, and live events.
4. Create the four identities with the exact constraints above.
5. Add the new secrets listed in DEPLOYMENT.md. Preserve the old destination secrets during staging.
6. Obtain the SSH host key through an existing verified connection and bind it to the private address.
7. Review the workflow PR and obtain the required merge approval.
8. Merge only when every private destination and identity is ready.
9. Verify the matching backend deployment and the read-only Production Check on `main`.
10. Confirm the CI node is ephemeral and removed after cleanup.
11. Close public administration ports only after all private callers and recovery access pass.

The merge changes the deployment workflow and starts a backend deployment.
Do not dispatch environment sync or owner repair merely to test network access.
Those workflows change production state. Use Production Check for the read-only rehearsal.
Do not disable TLS validation or SSH host-key verification to make a connection pass.

## Verification and rollback

Check workflow syntax and permissions before merging.
Confirm feature-branch runs are skipped and provider identities reject mismatched claims.
Verify SSH still rejects shell commands and forwarding with the database key.
Record live checks and provider settings in private operations notes, without secret values or customer data.
Repository CI cannot prove private routing before the infrastructure and identities exist.

Production Check first connects to the allowed VPS SSH port, then tests both protected computers' SSH ports.
Store their two Tailscale IPv4 addresses as a JSON array in `CI_ISOLATION_TARGETS` before merging this check.
A successful connection or unexpected network response fails the job. Only a timeout passes the blocked-route check.
For a live isolation audit, independently confirm both computers are online and their SSH ports work from an approved computer.
An offline computer can also time out, so scheduled runs alone do not prove isolation.
Keep addresses in the repository secret. Public logs identify devices by number only.

Owner repair still checks for positions and a positive portfolio value, but prints only the position count.
Never print account values in this public repository's workflow logs.

If a private route fails, keep public recovery access until the defect is fixed.
Before final firewall closure, an approved workflow revert can use the preserved old destination secrets.
After closure, repair through the verified administrator path or the provider recovery procedure.
Never restore public PostgreSQL access or an unrestricted tailnet policy as a CI workaround.

References:

- [Tailscale workload identity federation](https://tailscale.com/docs/features/workload-identity-federation)
- [Official Tailscale GitHub Action](https://github.com/tailscale/github-action)
