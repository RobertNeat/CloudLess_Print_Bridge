ARG RUNTIME_VERSION
FROM node:${RUNTIME_VERSION}-alpine AS build
RUN apk upgrade --no-cache
ARG PACKAGE_NAME
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter "${PACKAGE_NAME}..." build \
    && pnpm deploy --filter "${PACKAGE_NAME}" --prod --legacy /opt/app

FROM node:${RUNTIME_VERSION}-alpine
RUN apk upgrade --no-cache
ARG APP_PORT
ARG START_COMMAND
WORKDIR /app
COPY --from=build /opt/app ./
ENV START_COMMAND=${START_COMMAND}
USER node
EXPOSE ${APP_PORT}
CMD ["sh", "-c", "exec ${START_COMMAND}"]
