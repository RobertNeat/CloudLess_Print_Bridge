# Architecture

[Polski](architecture_pl.md) | English

Cross-service orientation map for CloudLess Print Bridge. This complements —
it does not replace — each app's own README and the deeper docs already
present in `apps/mqtt-puppeteer/docs/architecture.md` and
`apps/video-service-hub/docs/service_architecture.md`. Read those for
service-internal detail.

## The pieces

The system is five pieces plus one external actor, all confined to the local
network:

| Piece | Kind | Role |
| --- | --- | --- |
| `apps/mqtt-puppeteer` | NestJS | Bridges MQTT/TLS to the printer; exposes REST + Socket.IO |
| `apps/ftps-remote-manager` | NestJS | Bridges FTPS to the printer's SD card; exposes REST |
| `apps/video-service-hub` | NestJS | Camera command/ingest/streaming hub; talks to the camera firmware and runs its own MQTT broker |
| `apps/octo-management-dashboard` | Angular | Operator UI; consumes the three backends over HTTP |
| `packages/printer-contracts` | TS package | Shared, transport-agnostic printer domain DTOs |
| `firmware/m5-stack-unitcam-s3` | ESP32-S3 firmware | External actor: the camera device `video-service-hub` talks to |

## What talks to what

```text
octo-management-dashboard (Angular, :10300)
        |  HTTP (dev: proxy.conf.json /api/mqtt, /api/ftps, /api/video)
        v
+-------------------+   +----------------------+   +--------------------+
| mqtt-puppeteer     |   | ftps-remote-manager  |   | video-service-hub  |
| REST + Socket.IO   |   | REST                 |   | REST + embedded MQTT|
| :10320             |   | :10321               |   | :10322 (+ :1883)   |
+---------+---------+   +----------+-----------+   +---------+----------+
          | MQTT/TLS               | FTPS                    | HTTP + MQTT
          v                        v                         v
      Bambu Lab A1 printer    Bambu Lab A1 SD card     M5Stack UnitCam S3
```

- The dashboard reaches all three backends over plain REST/HTTP. In dev this
  is proxied by `apps/octo-management-dashboard/proxy.conf.json`
  (`/api/mqtt` → `:10320`, `/api/ftps` → `:10321` stripped, `/api/video` →
  `:10322` stripped); in production the same three prefixes are served
  through the dashboard's nginx container. `mqtt-puppeteer` additionally
  exposes a Socket.IO namespace (`/printer`) as a receive-only channel for
  real-time report/state/status events — the dashboard's HTTP client and
  this socket channel are separate concerns, see
  `apps/mqtt-puppeteer/docs/endpoints.md`.
- `mqtt-puppeteer` is the only service that speaks MQTT/TLS to the printer
  itself, merges its partial reports, and republishes a stable domain model.
- `ftps-remote-manager` is the only service that touches the printer's SD
  card, over FTPS with a pinned certificate fingerprint.
- `video-service-hub` is a separate concern entirely: it commands the ESP32
  camera firmware over HTTP, ingests JPEG/MJPEG/WAV uploads from it, and runs
  its own MQTT broker (embedded Aedes, or an external broker if
  `VIDEO_SERVICE_HUB_MQTT_URL` is set) for camera telemetry — this MQTT
  broker is unrelated to the printer's broker that `mqtt-puppeteer` connects
  to.
- None of the three backends talk to each other directly. Each owns one
  external protocol and exposes REST (plus Socket.IO for mqtt-puppeteer) to
  the dashboard.

For exact routes, payload shapes, and Socket.IO events, see each app's own
`README.md` and `docs/` folder — this file intentionally does not repeat
that detail.

## Why `printer-contracts` exists

`packages/printer-contracts` (`@cloudless/printer-contracts`) holds the
transport-agnostic DTOs for the printer domain model: the merged printer
state (`PrinterDomainModelDto`), AMS/filament slot models
(`AmsUnitDto`, `AmsSlotDto`, `ExternalSpoolDto`), motion/position types
(`MachineEnvelopeDto`, `PrinterPositionDto`), command request types
(`PrinterCommandId`, `PrinterCommandRequestDto`), operation results
(`PrinterOperationResultDto`), remote-storage entry types, and telemetry
sample types. It depends on neither NestJS, MQTT, nor Socket.IO.

It exists as a single source of truth so that:

- `mqtt-puppeteer` (and, increasingly, `ftps-remote-manager`) map their raw
  protocol data onto one shared, stable business model instead of each
  service inventing its own shape;
- the dashboard (and any future consumer) can import the same types instead
  of retyping them against a REST response;
- a change to the printer's protocol (a different printer model, a
  different mapper) never has to leak into frontend or cross-service code —
  only the mapper that produces the DTO changes.

See `packages/printer-contracts/README.md` for the exported types and
`packages/README.md` for the packages directory as a whole. For the general
pattern of what to share as a contract (and what not to), see
[shared-contracts.md](./shared-contracts.md).

## The "cloudless" / LAN-only principle

Every arrow in the diagram above stays on the local network. There is no
cloud relay, no vendor account, and no internet-hosted broker in the
critical path: the dashboard, the three backend services, the printer, and
the camera firmware are all expected to sit on the same LAN. Each backend
service explicitly documents that it is designed for a trusted local network
(see the "Konfiguracja"/security notes in each app's README) and that
exposing it beyond the LAN requires adding authentication and tightening
CORS — this is a deliberate scope boundary, not an oversight.

## Where to look next

- `apps/mqtt-puppeteer/README.md`, `apps/mqtt-puppeteer/docs/architecture.md`,
  `apps/mqtt-puppeteer/docs/endpoints.md` — MQTT bridge internals and REST/Socket.IO contract.
- `apps/ftps-remote-manager/README.md` — FTPS bridge and file API.
- `apps/video-service-hub/README.md`,
  `apps/video-service-hub/docs/service_architecture.md`,
  `apps/video-service-hub/docs/rest_endpoints.md` — camera hub internals.
- `packages/printer-contracts/README.md` — shared DTO exports.
- `docs/readmes/shared-contracts.md` — general pattern for sharing types/DTOs/contracts across services.
- `docs/readmes/environment-variables.md` — full environment variable reference.
- `docs/readmes/running-ghcr-images.md` — running published GHCR images with your own `.env`.
- `docs/readmes/operations.md` — this repo's CI/CD and deployment configuration.
- `docs/readmes/development.md` — day-to-day dev commands.
