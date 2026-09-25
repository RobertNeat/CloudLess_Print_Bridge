# Running published GHCR images

[Polski](running-ghcr-images_pl.md) | English

How to run this project from published container images without cloning the
repo or building anything locally. This is the end-user counterpart to
`docs/readmes/operations.md`, which documents this repo's own automated
deploy pipeline (`deploy_compose_ssh.sh`, SSH, the production host at
`192.168.1.160`) — this file assumes none of that access and instead starts
from "I ran `docker pull`."

## Where the images come from

`.github/workflows/release_ghcr.yaml` publishes images when a Git tag
matching `release_X.Y.Z` is pushed (or a GitHub Release is published, or the
workflow is dispatched manually against an existing tag). For each project
declared in `.github/ci/projects.json` it pushes:

```text
ghcr.io/robertneat/cloudless-print-bridge/<image>:X.Y.Z
```

For this repo's four projects, that's the following images — the pull
commands below target version `1.0.0`; for a later release, replace
`1.0.0` with that release's version (the part after `release_` in its Git
tag, e.g. tag `release_1.3.0` → `1.3.0`):

```bash
docker pull ghcr.io/robertneat/cloudless-print-bridge/mqtt-puppeteer:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/ftps-remote-manager:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/video-service-hub:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/octo-management-dashboard:1.0.0
```

The GitHub Release created for a given tag lists the exact image
references for that version — see the repo's
[Releases page](../../../../releases) or `git tag -l "release_*"` for
available versions.

## What you need

- Docker with Compose v2 (`docker compose`, not the standalone `docker-compose`).
- The repo's `deploy/compose.yml` file — you don't need the rest of the repo,
  just this one file. Download it directly from the tag you're deploying,
  e.g. from the GitHub UI at `deploy/compose.yml` on the `release_X.Y.Z` tag,
  or with `git archive`/`curl` against the raw file URL for that tag.
- The repo's `.env.example` file (same tag), as your configuration starting
  point.

## Step 1 — build your `.env`

Copy `.env.example` to `.env` and fill in your printer/camera specifics
(printer IP, MQTT/FTPS access code, camera addresses, etc.) — see
[environment-variables.md](./environment-variables.md) for what every
variable means.

`.env.example` covers application-level configuration (auth, printer/camera
connection details, size limits). It does **not** cover the variables
`deploy/compose.yml` needs to select *which images* to run and *which ports*
to publish them on:

```text
REGISTRY, IMAGE_TAG
MQTT_PUPPETEER_IMAGE,               ftps-remote-manager / video-service-hub / octo-management-dashboard equivalents
MQTT_PUPPETEER_HOST_PORT, MQTT_PUPPETEER_CONTAINER_PORT,   and the same pair for the other three services
```

In this repo's own CI/CD pipeline those are generated automatically from
`.github/ci/projects.json` by `.github/steps/deploy_compose_ssh.sh` into a
separate `projects.env` file — see `docs/readmes/operations.md`. Running from
a downloaded GHCR release, you don't have that automation, so add these
variables to your own `.env` by hand. Append this block (adjust values as
needed — the ports shown are this repo's defaults):

```env
# Image selection
REGISTRY=ghcr.io/robertneat/cloudless-print-bridge
IMAGE_TAG=1.0.0

MQTT_PUPPETEER_IMAGE=mqtt-puppeteer
FTPS_REMOTE_MANAGER_IMAGE=ftps-remote-manager
VIDEO_SERVICE_HUB_IMAGE=video-service-hub
OCTO_MANAGEMENT_DASHBOARD_IMAGE=octo-management-dashboard

# Host/container ports
MQTT_PUPPETEER_HOST_PORT=10320
MQTT_PUPPETEER_CONTAINER_PORT=10320
FTPS_REMOTE_MANAGER_HOST_PORT=10321
FTPS_REMOTE_MANAGER_CONTAINER_PORT=10321
VIDEO_SERVICE_HUB_HOST_PORT=10322
VIDEO_SERVICE_HUB_CONTAINER_PORT=10322
OCTO_MANAGEMENT_DASHBOARD_HOST_PORT=10300
OCTO_MANAGEMENT_DASHBOARD_CONTAINER_PORT=10300
```

`IMAGE_TAG=1.0.0` targets the `release_1.0.0` tag. For a later release,
replace `1.0.0` with that release's version everywhere above (the part
after `release_` in its Git tag, e.g. tag `release_1.3.0` → `IMAGE_TAG=1.3.0`).

## Step 2 — run on a different port

Because `*_HOST_PORT` is your own variable, not baked into the image, you
can freely repoint it. For example, to run the dashboard on `8080` instead
of the default `10300`, just change:

```env
OCTO_MANAGEMENT_DASHBOARD_HOST_PORT=8080
```

`*_CONTAINER_PORT` is the port the app listens on *inside* the container —
leave it at the default unless you're also overriding the app's own
`*_PORT` variable (see `environment-variables.md`) to make it listen
elsewhere internally. Changing only `HOST_PORT` (the left side of Compose's
`"${HOST_PORT}:${CONTAINER_PORT}"` mapping) is enough for "expose this
service on a different local port."

Note `video-service-hub` also always publishes `1883:1883` (its embedded
MQTT broker for the cameras) — that mapping is fixed in `compose.yml`, not
templated by a variable.

## Step 3 — start the stack

From the directory containing your `.env` and the downloaded `compose.yml`:

```bash
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
```

This pulls the four images at `${IMAGE_TAG}` from `${REGISTRY}` and starts
them together as one Compose project, wired the same way as production:
the dashboard waits for `mqtt-puppeteer` and `video-service-hub` to report
healthy before starting, `video-service-hub` gets a persistent named volume
for recordings, and all four share the `CLOUDLESS_AUTH_*` variables from
your `.env`.

Check status and logs the usual Compose way:

```bash
docker compose --env-file .env -f compose.yml ps
docker compose --env-file .env -f compose.yml logs -f
```

Open the dashboard at `http://<host>:<OCTO_MANAGEMENT_DASHBOARD_HOST_PORT>/`.

## Updating to a new release

Change `IMAGE_TAG` in your `.env` to the new version, then repeat step 3
(`pull` followed by `up -d`) — Compose recreates only the containers whose
image actually changed.

## Related docs

- [environment-variables.md](./environment-variables.md) — full reference for every application-level variable in `.env.example`.
- [operations.md](./operations.md) — this repo's own CI/CD pipeline and automated production deploy (the source of the `projects.json` → `projects.env` pattern referenced above).
- [architecture.md](./architecture.md) — what each service does and how they talk to each other.
