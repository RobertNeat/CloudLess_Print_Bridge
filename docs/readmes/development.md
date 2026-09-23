# Development

[Polski](development_pl.md) | English

Day-to-day commands for working in this monorepo. For the bigger picture see
`docs/readmes/architecture.md`; for env vars see `docs/readmes/env_variables_description.md`
and each app's own README.

## Prerequisites

- Node.js `24` (the version declared per-project in `.github/ci/projects.json`).
- pnpm `11.17.0` (the `packageManager` field in root `package.json`).

## Install

```bash
pnpm install
```

## Run a service in dev mode

Root scripts (from `package.json`), each backed by `pnpm --filter`:

```bash
pnpm dev:mqtt        # @cloudless/mqtt-puppeteer   -> start:dev, :10320
pnpm dev:ftps        # @cloudless/ftps-remote-manager -> start:dev, :10321
pnpm dev:video       # @cloudless/video-service-hub -> start:dev, :10322 (+ MQTT :1883)
pnpm dev:dashboard   # @cloudless/octo-management-dashboard -> start (ng serve), :10300
```

Equivalent direct form:

```bash
pnpm --filter @cloudless/mqtt-puppeteer start:dev
pnpm --filter @cloudless/ftps-remote-manager start:dev
pnpm --filter @cloudless/video-service-hub start:dev
pnpm --filter @cloudless/octo-management-dashboard start
```

The dashboard dev server proxies `/api/mqtt`, `/api/ftps`, `/api/video` to
the three backend ports via `apps/octo-management-dashboard/proxy.conf.json`
— it expects the backends on their default ports (10320/10321/10322).
Running a backend on a custom port breaks that proxy.

## Tests

Per app, `test` (Jest for the three NestJS apps, `ng test`/vitest for the
dashboard):

```bash
pnpm --filter @cloudless/mqtt-puppeteer test
pnpm --filter @cloudless/ftps-remote-manager test
pnpm --filter @cloudless/video-service-hub test
pnpm --filter @cloudless/octo-management-dashboard test
```

`test:e2e` exists in the three NestJS apps only — the dashboard's
`package.json` has no `test:e2e` script:

```bash
pnpm --filter @cloudless/mqtt-puppeteer test:e2e
pnpm --filter @cloudless/ftps-remote-manager test:e2e
pnpm --filter @cloudless/video-service-hub test:e2e
```

Root-wide:

```bash
pnpm test   # pnpm -r test
```

## Lint / typecheck / check

Each app defines `check` as lint + typecheck (see each `package.json`):

```bash
pnpm --filter <package-name> lint
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> check
pnpm lint   # pnpm -r lint (root script)
```

**Known current state:** `pnpm -r lint` currently fails. `video-service-hub`
has pre-existing ESLint/Prettier CRLF formatting errors in several
already-committed files, and `octo-management-dashboard`'s
`prettier --check` reports formatting mismatches across roughly 99 files.
Both are pre-existing issues, not something introduced by unrelated changes
— don't expect a clean `pnpm -r lint` today, and don't try to fix the whole
backlog as a side effect of an unrelated change. `pnpm -r lint` also only
covers workspace members that define a `lint` script (five of the six
workspace projects at the time of writing); it is not a guarantee every
package was checked.

## Build

```bash
pnpm --filter <package-name> build
pnpm build   # pnpm -r build (root script)
```

## Approximating CI locally

`.github/workflows/pre_merge_check.yaml` runs the `check` job
(`.github/workflows/_job_check.yaml`) for every push/PR. Its per-project step
is `.github/steps/check_node.sh`, which for each declared project:

1. installs the pinned Node version via `mise`;
2. runs `pnpm install --frozen-lockfile` and builds workspace dependencies;
3. runs the project's `check_script` (i.e. `pnpm run check`);
4. runs `trivy fs` (dependency vulnerability scan) and `semgrep scan` (SAST).

You can reproduce step 3 locally with `pnpm --filter <package-name> check`.
Steps 1, 2 and 4 require `mise`, `trivy`, and `semgrep` to be installed
locally to fully reproduce what CI does — `pnpm run check` alone is a good
approximation of code quality gates, but not a full substitute for the CI
job's dependency/SAST scanning.

To validate `.github/ci/projects.json` itself (the file that declares which
apps exist, their ports, images, and Dockerfiles) before touching it:

```bash
bash .github/steps/validate_projects.sh .github/ci/projects.json
```

This requires `jq` and checks, among other things, that every directory
under `apps/` is declared exactly once.

## Environment variables

Copy `.env.example` at the repo root to `.env` and fill in printer/camera
specifics. For the full variable reference (auth, per-service vars,
`${VAR}` interpolation rules) see `docs/readmes/env_variables_description.md`, or
each app's own README for that service's variables in isolation.

## Related docs

- `docs/readmes/architecture.md` — cross-service architecture map.
- `docs/readmes/operations.md` — CI/CD and deployment configuration for this repo.
- `docs/readmes/env_variables_description.md` — full environment variable reference.
