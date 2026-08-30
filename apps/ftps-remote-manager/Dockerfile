ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/printer-contracts/package.json packages/printer-contracts/package.json
COPY apps/ftps-remote-manager/package.json apps/ftps-remote-manager/package.json
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/ftps-remote-manager apps/ftps-remote-manager
RUN pnpm --filter @cloudless/printer-contracts build \
  && pnpm --filter @cloudless/ftps-remote-manager build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /workspace/apps/ftps-remote-manager

COPY --from=build /workspace /workspace

EXPOSE 10221
CMD ["node", "dist/main.js"]
