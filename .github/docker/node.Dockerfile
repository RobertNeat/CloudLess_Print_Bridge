ARG RUNTIME_VERSION
FROM node:${RUNTIME_VERSION}-alpine AS build
RUN apk upgrade --no-cache
ARG PACKAGE_NAME
ARG PROJECT_PATH
WORKDIR /workspace
RUN corepack enable
ENV npm_config_store_dir=/pnpm/store

# Install dependencies before copying the rest of the source so this layer
# (and the pnpm store cache mount below) stays valid across source-only
# commits, avoiding a full cold reinstall of every package on every build.
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ftps-remote-manager/package.json ./apps/ftps-remote-manager/package.json
COPY apps/mqtt-puppeteer/package.json ./apps/mqtt-puppeteer/package.json
COPY apps/octo-management-dashboard/package.json ./apps/octo-management-dashboard/package.json
COPY apps/video-service-hub/package.json ./apps/video-service-hub/package.json
COPY packages/printer-contracts/package.json ./packages/printer-contracts/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter "${PACKAGE_NAME}..." build \
    && pnpm deploy --filter "${PACKAGE_NAME}" --prod --legacy /opt/app

FROM node:${RUNTIME_VERSION}-alpine
RUN apk upgrade --no-cache
ARG APP_PORT
ARG START_COMMAND
ARG PROJECT_PATH
ARG BUILD_OUTPUT
WORKDIR /app
COPY --from=build /opt/app ./
# pnpm deploy --prod only assembles production node_modules + the package
# manifest; it never copies build artifacts, so the compiled dist/ output
# has to be copied explicitly from the build stage's workspace checkout.
COPY --from=build /workspace/${PROJECT_PATH}/${BUILD_OUTPUT} ./${BUILD_OUTPUT}
ENV START_COMMAND=${START_COMMAND}
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE ${APP_PORT}
CMD ["sh", "-c", "exec ${START_COMMAND}"]
