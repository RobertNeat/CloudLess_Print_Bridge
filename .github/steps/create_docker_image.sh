#!/usr/bin/env bash
set -euo pipefail

: "${REGISTRY:?REGISTRY is required}"
: "${PROJECT_JSON:?PROJECT_JSON is required}"
: "${SHA:?SHA is required}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "A lowercase full commit SHA is required" >&2; exit 2; }
jq -e 'type == "object"' <<< "$PROJECT_JSON" >/dev/null

json_string() {
  jq -er "$1 | select(type == \"string\" and length > 0)" <<< "$PROJECT_JSON"
}

IMAGE="$(json_string '.image')"
DOCKERFILE="$(json_string '.dockerfile')"
PROJECT_PATH="$(json_string '.path')"
RUNTIME_VERSION="$(json_string '.version')"
PACKAGE_NAME="$(jq -r '.package_name // ""' <<< "$PROJECT_JSON")"
BUILD_OUTPUT="$(jq -r '.build_output // ""' <<< "$PROJECT_JSON")"
SERVER_CONFIG="$(jq -r '.server_config // ""' <<< "$PROJECT_JSON")"
START_COMMAND="$(jq -r '.start_command // ""' <<< "$PROJECT_JSON")"
APP_PORT="$(jq -er '.ports.container | select(type == "number" and . >= 1 and . <= 65535)' <<< "$PROJECT_JSON")"

test -f "$DOCKERFILE"
test -d "$PROJECT_PATH"

image_ref="${REGISTRY}/${IMAGE}:${SHA}"
if docker manifest inspect "$image_ref" >/dev/null 2>&1; then
  echo "Immutable image already exists; reusing $image_ref"
  docker pull "$image_ref"
  exit 0
fi

docker build --pull \
  --file "$DOCKERFILE" \
  --build-arg "PROJECT_PATH=$PROJECT_PATH" \
  --build-arg "RUNTIME_VERSION=$RUNTIME_VERSION" \
  --build-arg "PACKAGE_NAME=$PACKAGE_NAME" \
  --build-arg "BUILD_OUTPUT=$BUILD_OUTPUT" \
  --build-arg "SERVER_CONFIG=$SERVER_CONFIG" \
  --build-arg "START_COMMAND=$START_COMMAND" \
  --build-arg "APP_PORT=$APP_PORT" \
  --label "org.opencontainers.image.revision=$SHA" \
  --tag "$image_ref" \
  .
