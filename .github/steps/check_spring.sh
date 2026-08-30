#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_PATH:?PROJECT_PATH is required}"
: "${RUNTIME_VERSION:?RUNTIME_VERSION is required}"
: "${BUILD_TOOL:=maven}"

command -v mise >/dev/null
command -v trivy >/dev/null
command -v semgrep >/dev/null

case "$BUILD_TOOL" in
  maven)
    test -f "$PROJECT_PATH/pom.xml"
    mise exec "java@temurin-${RUNTIME_VERSION}" -- java -version
    (cd "$PROJECT_PATH" && mise exec "java@temurin-${RUNTIME_VERSION}" "maven@3.9" -- mvn --batch-mode verify)
    ;;
  gradle)
    test -x "$PROJECT_PATH/gradlew"
    (cd "$PROJECT_PATH" && mise exec "java@temurin-${RUNTIME_VERSION}" -- ./gradlew --no-daemon check assemble)
    ;;
  *) echo "Unsupported Spring build tool: $BUILD_TOOL" >&2; exit 2 ;;
esac

trivy fs --exit-code 1 --severity HIGH,CRITICAL --scanners vuln "$PROJECT_PATH"
semgrep scan --config auto --error "$PROJECT_PATH"
