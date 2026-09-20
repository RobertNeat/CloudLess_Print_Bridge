# Operations

[Polski](operations_pl.md) | English

This repo's specific CI/CD and deployment configuration. For how the
pipeline product works in general (it is designed to be portable — see
`.github/pipeline_docs/overview.md`, which literally says you can copy
`.github` into another repository), read `.github/pipeline_docs/`. This file
only documents *this repo's* instantiation of that pipeline: which projects
are declared, on which ports, built with which Dockerfiles, deployed where.

## Declared projects (`.github/ci/projects.json`)

| Project | Framework | Path | Host port | Container port |
| --- | --- | --- | --- | --- |
| `mqtt-puppeteer` | nestjs | `apps/mqtt-puppeteer` | 10320 | 10320 |
| `ftps-remote-manager` | nestjs | `apps/ftps-remote-manager` | 10321 | 10321 |
| `video-service-hub` | nestjs | `apps/video-service-hub` | 10322 | 10322 |
| `octo-management-dashboard` | angular | `apps/octo-management-dashboard` | 10300 | 10300 |

All four use `check_script: "check"`. The three NestJS apps build with
`.github/docker/node.Dockerfile` and start via `start_command: "node dist/main.js"`
(`build_output: "dist"`). The dashboard builds with
`.github/docker/angular.Dockerfile` and has no `start_command` — it serves
its static build (`apps/octo-management-dashboard/dist/octo-management-dashboard/browser`)
through nginx, configured by `server_config: "apps/octo-management-dashboard/nginx.conf"`.
`video-service-hub`'s embedded MQTT broker port (`1883`) is not part of the
`projects.json` port contract — it is published separately in
`deploy/compose.yml`.

## Dockerfiles

- `.github/docker/node.Dockerfile` — two-stage build. Stage 1 installs the
  full workspace with `pnpm install --frozen-lockfile`, builds the target
  package and its workspace deps (`pnpm --filter "<pkg>..." build`), then
  assembles a production-only `node_modules` with `pnpm deploy --prod`.
  Stage 2 copies that deployed app plus the built `dist/` output into a
  fresh `node:${RUNTIME_VERSION}-alpine` image, runs as the non-root `node`
  user, and execs `${START_COMMAND}`.
- `.github/docker/angular.Dockerfile` — two-stage build. Stage 1 installs
  the workspace and runs `ng build` for the target package. Stage 2 copies
  the static build output into an `nginx:1.29-alpine` image alongside the
  app's `nginx.conf`, plus a runtime auth-config template/render script
  (`cloudless-auth.runtime.js.template`, `render-auth-runtime.sh`).

Both Dockerfiles were confirmed to exist at the paths above.

## Deploy target (`projects.json`'s `deploy` block)

| Field | Value |
| --- | --- |
| `environment` | `production` |
| `host` | `192.168.1.160` |
| `user` | `docker_deploy` |
| `registry` | `192.168.1.162:5000` |
| `compose_file` | `deploy/compose.yml` |
| `config_file` | `.env.example` |
| `remote_dir` | `/home/docker_deploy/cloudless-print-bridge` |

These are LAN addresses and non-secret deployment coordinates committed to
the repo, not credentials.

## `deploy/compose.yml`

Confirmed to exist. Composes the four services above as one Compose
project (`cloudless-print-bridge`):

- each service's `image` is templated from `${REGISTRY}`/`${IMAGE_TAG}`, so
  the same commit SHA identifies the whole set of images;
- `mqtt-puppeteer` and `video-service-hub` get HTTP healthchecks
  (`/api/mqtt/health`, `/health`); `ftps-remote-manager` has none yet;
- `video-service-hub` additionally publishes `1883:1883` for its embedded
  MQTT broker and mounts a named volume (`video-service-hub-data`) at `/data`
  for persistent storage;
- `octo-management-dashboard` depends on `mqtt-puppeteer` and
  `video-service-hub` reaching `service_healthy` (not just "started") before
  it starts, and on `ftps-remote-manager` reaching `service_started` — this
  avoids nginx's "host not found in upstream" race, since `ftps-remote-manager`
  has no health endpoint to wait on yet;
- shared `CLOUDLESS_AUTH_*` variables configure the cross-service auth mode
  identically on all three backends plus the dashboard.

## `infrastructure/` discrepancy

`infrastructure/README.md` describes a planned layout
(`infrastructure/docker/*.Dockerfile`, `infrastructure/compose/docker-compose.yml`,
`infrastructure/proxy/nginx.conf`, `infrastructure/env/.env.example`) that
was never actually built — the directory currently contains only that
README. The real Dockerfiles live under `.github/docker/`, and the real
compose file is `deploy/compose.yml`; if you open `infrastructure/` expecting
those files, they are not there yet.

## Pipeline stages at a glance

See `.github/pipeline_docs/overview.md` for full detail. This repo runs all
five stages:

- **check** — validates `projects.json`, runs each project's `check_script`,
  builds it, and runs Trivy (dependency scan) + Semgrep (SAST). Wired to
  `.github/workflows/pre_merge_check.yaml` on every push/PR.
- **build** — builds each project's Docker image, scans it with Trivy, and
  stores it in the local registry under the full commit SHA.
- **deploy** — brings up exactly that set of images on the production host
  via `deploy_compose_ssh.sh`.
- **release** — republishes a chosen SHA's images to GHCR under a version tag.
- **github_release** — creates a GitHub release named after that tag.

## `.github/steps/*.sh` scripts (Node-relevant ones)

- `check_node.sh` — per-project `check` step: installs the pinned Node
  version via `mise`, `pnpm install --frozen-lockfile`, builds workspace
  deps, runs the project's `check_script`, then `trivy fs` and `semgrep scan`.
- `validate_projects.sh` — validates the shape of `projects.json` itself
  (schema, required deploy fields, per-project field consistency, unique
  names/paths/images/ports) and cross-checks that every directory under each
  `pipeline.project_roots` entry (i.e. `apps/`) is declared exactly once.
- `create_docker_image.sh` — builds one project's Docker image tagged
  `${REGISTRY}/${IMAGE}:${SHA}` (skipping the build if that immutable tag
  already exists remotely) using the project's declared Dockerfile and
  build args.
- `scan_docker_image.sh` — runs `trivy image` against the built image,
  optionally filtering out vulnerabilities matched by the project's
  `Trivy_exceptions` list before failing the build.
- `push_image_ghcr.sh` — retags a given local image by SHA to
  `ghcr.io/<owner>/<image>:<version>` and pushes it, refusing to overwrite an
  existing release tag that points to a different digest.
- `push_local_image.sh` — pushes an image to the local registry under its
  SHA tag, refusing to silently overwrite an existing immutable tag with
  different content.
- `deploy_compose_ssh.sh` — copies `compose.yml` and a generated
  `projects.env` (image names + ports per project) to the remote host over
  SSH/SCP, installs `.env.example` as the remote `config.env` only if one
  doesn't already exist there, then runs `docker compose ... pull` and
  `up -d --remove-orphans`.
- `cleanup_runner_images.sh` — on the self-hosted runner, removes older
  local images for each declared project's image name, keeping only the
  current SHA's tag (or the most recent one if the current SHA isn't
  present), then prints `docker system df`.

## Related docs

- `.github/pipeline_docs/overview.md`, `pipeline_guidelines.md`,
  `pre_merge_check.md`, `production_deployment.md`, `release_ghcr.md` — the
  portable, repo-agnostic explanation of how the pipeline product works.
- `docs/architecture.md` — cross-service architecture map.
- `docs/development.md` — day-to-day dev commands.
