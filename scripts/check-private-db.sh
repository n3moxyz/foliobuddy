#!/usr/bin/env bash
# CI client for the restricted database SSH key. Secrets stay in temporary files.
set -euo pipefail

case "${1:-}" in
  health|x-health|owner) ;;
  *) echo 'Expected health, x-health, or owner.' >&2; exit 64 ;;
esac
: "${DB_SSH_HOST:?Set the private DB_SSH_HOST secret}"
: "${DB_SSH_PRIVATE_KEY:?Set the restricted DB_SSH_PRIVATE_KEY secret}"
: "${DB_SSH_KNOWN_HOSTS:?Set the verified DB_SSH_KNOWN_HOSTS secret}"

umask 077
key_dir=$(mktemp -d)
trap 'rm -rf "$key_dir"' EXIT
printf '%s\n' "$DB_SSH_PRIVATE_KEY" > "$key_dir/key"
printf '%s\n' "$DB_SSH_KNOWN_HOSTS" > "$key_dir/known_hosts"
unset DB_SSH_PRIVATE_KEY DB_SSH_KNOWN_HOSTS

ssh -T -i "$key_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=12 \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$key_dir/known_hosts" \
  -o ControlMaster=no -o ControlPath=none \
  -l root -- "$DB_SSH_HOST" "$1"
