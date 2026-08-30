ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/printer-contracts/package.json packages/printer-contracts/package.json
COPY apps/mqtt-puppeteer/package.json apps/mqtt-puppeteer/package.json
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/mqtt-puppeteer apps/mqtt-puppeteer
RUN pnpm --filter @cloudless/printer-contracts build \
  && pnpm --filter @cloudless/mqtt-puppeteer build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /workspace/apps/mqtt-puppeteer

COPY --from=build /workspace /workspace

EXPOSE 10220
CMD ["node", "dist/main.js"]
