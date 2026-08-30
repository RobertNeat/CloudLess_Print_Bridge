#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${REGISTRY:?REGISTRY is required}"
: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${CONFIG_FILE:?CONFIG_FILE is required}"
: "${REMOTE_DIR:?REMOTE_DIR is required}"
: "${SHA:?SHA is required}"

test -f "$COMPOSE_FILE"
test -f "$CONFIG_FILE"
test -f .github/ci/projects.json
remote="${DEPLOY_USER}@${DEPLOY_HOST}"
remote_dir_q="$(printf '%q' "$REMOTE_DIR")"
registry_q="$(printf '%q' "$REGISTRY")"
sha_q="$(printf '%q' "$SHA")"
projects_env="$(mktemp)"
trap 'rm -f "$projects_env"' EXIT
jq -r '
  .projects[] |
  (.name | ascii_upcase | gsub("[^A-Z0-9]"; "_")) as $prefix |
  "\($prefix)_IMAGE=\(.image)\n" +
  "\($prefix)_HOST_PORT=\(.ports.host)\n" +
  "\($prefix)_CONTAINER_PORT=\(.ports.container)"
' .github/ci/projects.json > "$projects_env"
test -s "$projects_env"

ssh -o BatchMode=yes "$remote" "mkdir -p -- $remote_dir_q"
scp "$COMPOSE_FILE" "$remote:$REMOTE_DIR/compose.yml"
scp "$CONFIG_FILE" "$remote:$REMOTE_DIR/config.env"
scp "$projects_env" "$remote:$REMOTE_DIR/projects.env"
ssh -o BatchMode=yes "$remote" \
  "cd $remote_dir_q && REGISTRY=$registry_q IMAGE_TAG=$sha_q docker compose --env-file config.env --env-file projects.env config --quiet && REGISTRY=$registry_q IMAGE_TAG=$sha_q docker compose --env-file config.env --env-file projects.env pull && REGISTRY=$registry_q IMAGE_TAG=$sha_q docker compose --env-file config.env --env-file projects.env up -d --remove-orphans"
