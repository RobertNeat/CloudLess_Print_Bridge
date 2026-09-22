ARG RUNTIME_VERSION
FROM node:${RUNTIME_VERSION}-alpine AS build
RUN apk upgrade --no-cache
ARG PROJECT_PATH
ARG PACKAGE_NAME
WORKDIR /workspace
RUN corepack enable
ENV npm_config_store_dir=/pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
    && pnpm --filter "${PACKAGE_NAME}..." build

FROM nginx:1.29-alpine
RUN apk upgrade --no-cache
ARG BUILD_OUTPUT
ARG SERVER_CONFIG
ARG PROJECT_PATH
ARG APP_PORT
COPY --from=build /workspace/${BUILD_OUTPUT} /usr/share/nginx/html
COPY ${SERVER_CONFIG} /etc/nginx/conf.d/default.conf
COPY ${PROJECT_PATH}/cloudless-auth.runtime.js.template /etc/nginx/cloudless-auth.runtime.js.template
COPY ${PROJECT_PATH}/render-auth-runtime.sh /docker-entrypoint.d/50-render-auth-runtime.sh
RUN chmod +x /docker-entrypoint.d/50-render-auth-runtime.sh
EXPOSE ${APP_PORT}
