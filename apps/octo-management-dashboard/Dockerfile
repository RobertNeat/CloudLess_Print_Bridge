ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/octo-management-dashboard/package.json apps/octo-management-dashboard/package.json
RUN pnpm install --frozen-lockfile

COPY apps/octo-management-dashboard apps/octo-management-dashboard
RUN pnpm --filter @cloudless/octo-management-dashboard build

FROM nginx:1.29-alpine AS runtime

COPY apps/octo-management-dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/octo-management-dashboard/dist/octo-management-dashboard/browser /usr/share/nginx/html

EXPOSE 10200
