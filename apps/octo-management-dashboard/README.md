# octo-management-dashboard

Angular frontend for CloudLess Print Bridge. This is the actual management
UI: it does not talk to the printer, the SD card, or the cameras directly —
it composes the three backend services (`mqtt-puppeteer`,
`ftps-remote-manager`, `video-service-hub`) into one dashboard.

Polish translation: [README_pl.md](./README_pl.md).

## What it does

The app is split into three routed sections (`src/app/app.routes.ts`),
each gated by a `dashboardAccessGuard`:

- **`/management`** (`src/app/dashboard/`) — printer control and monitoring.
  Current print job status, printer temperatures, a telemetry chart,
  quick controls, and a jog/navigation panel (`printer-quick-controls`,
  `printer-navigation`), plus a live camera preview widget
  (`live-preview`). Talks to `mqtt-puppeteer`.
- **`/files`** (`src/app/files/`) — a file browser for the printer's
  microSD card: file tree, file list, file details, and an upload zone.
  Talks to `ftps-remote-manager`.
- **`/videos`** (`src/app/videos/`) — the camera/video dashboard: a camera
  panel, live MJPEG preview, a media library with search, media playback
  (`video-player`, `mp4-player`), and a record dialog for starting
  captures/recordings. Talks to `video-service-hub`.

The `/management` layout is built from **gridster** widgets
(`angular-gridster2`) so the user can rearrange, resize, and persist the
widget layout (`src/app/core/dashboard-layout.service.ts`); `/files` has its
own analogous layout service.

Backend integration is behind small port/adapter interfaces (e.g.
`MANAGEMENT_DASHBOARD_DATA_SOURCE`, `FILES_REPOSITORY`, `VIDEOS_REPOSITORY`
in `src/app/app.config.ts`), so each section can fall back to a mock data
source if a real backend isn't wired up.

## Running it

From the repo root (preferred, matches the monorepo convention):

```bash
pnpm install
pnpm dev:dashboard
```

Or directly against this package's own scripts
(`apps/octo-management-dashboard/package.json`):

```bash
pnpm --filter @cloudless/octo-management-dashboard start      # ng serve, dev server
pnpm --filter @cloudless/octo-management-dashboard build      # ng build
pnpm --filter @cloudless/octo-management-dashboard watch      # ng build --watch (development config)
pnpm --filter @cloudless/octo-management-dashboard test       # ng test (Vitest)
pnpm --filter @cloudless/octo-management-dashboard lint       # prettier --check
pnpm --filter @cloudless/octo-management-dashboard typecheck  # ng build --configuration development
pnpm --filter @cloudless/octo-management-dashboard check      # lint + typecheck
```

There is no `e2e` script in this package — don't reach for `ng e2e`, it
isn't wired up here.

## Talking to the backend services

Each backend has its own small config service under `src/app/*/backend/`
(`MqttPuppeteerConfig`, `FtpsRemoteManagerConfig`, `VideoServiceHubConfig`),
resolving a base URL from a runtime-injected `window.__CLOUDLESS_AUTH__`
config (see `src/app/core/cloudless-auth.config.ts`), falling back to these
defaults if nothing is injected:

| Service | Default base URL | Transport |
| --- | --- | --- |
| `mqtt-puppeteer` | `http://localhost:10320` | REST (polling) |
| `ftps-remote-manager` | `http://localhost:10321` | REST |
| `video-service-hub` | `http://localhost:10322` | REST (commands, telemetry) + tokened MJPEG stream over HTTP for live preview |

All outgoing requests go through a shared `cloudlessAuthInterceptor` for
auth headers. As of this writing the app does **not** use Socket.IO on the
frontend — `mqtt-puppeteer` exposes a Socket.IO namespace, but the
dashboard's current integration polls REST endpoints instead
(`src/app/dashboard/backend/dashboard-polling.service.ts` notes this
explicitly as the chosen interim strategy; `socket.io-client` isn't a
dependency of this package yet). Live camera preview instead opens a
tokened MJPEG stream URL directly against `video-service-hub`
(`GET /api/v1/live/{cameraId}/{requestId}/stream`).

### Dev-server proxy

`proxy.conf.json` wires the dashboard's Angular dev server to all three
backends:

| Path prefix | Proxies to |
| --- | --- |
| `/api/mqtt` | `http://localhost:10320` (`mqtt-puppeteer`) |
| `/api/ftps` | `http://localhost:10321` (`ftps-remote-manager`) |
| `/api/video` | `http://localhost:10322` (`video-service-hub`) |

The `video-service-hub` proxy target is hardcoded to port `10322`. Running
that service on a custom port breaks the dev proxy for `/api/video` unless
`proxy.conf.json` is updated to match — this is a known constraint, not
something the dashboard dev server auto-detects.

## UI library

Built on PrimeNG `21.1.9`, deliberately pinned — it's the last
open-source-licensed PrimeNG major. Do not bump this dependency as part of
routine maintenance; treat any upgrade of PrimeNG as a deliberate,
separately-considered decision, not a routine bump.

## Related

- [mqtt-puppeteer](../mqtt-puppeteer/README.md)
- [ftps-remote-manager](../ftps-remote-manager/README.md)
- [video-service-hub](../video-service-hub/README.md)
- [printer-contracts](../../packages/printer-contracts/README.md)
