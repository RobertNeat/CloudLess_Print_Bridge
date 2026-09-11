#!/bin/sh
set -eu

: "${CLOUDLESS_AUTH_MODE:=disabled}"
: "${CLOUDLESS_AUTH_SERVICE_ORDER:=mqtt-puppeteer,ftps-remote-manager,video-service-hub}"
export CLOUDLESS_AUTH_MODE CLOUDLESS_AUTH_SERVICE_ORDER

envsubst '${CLOUDLESS_AUTH_MODE} ${CLOUDLESS_AUTH_SERVICE_ORDER}' \
  < /etc/nginx/cloudless-auth.runtime.js.template \
  > /usr/share/nginx/html/cloudless-auth.runtime.js
