# CloudLess Print Bridge environment variables

[Polski](environment-variables_pl.md) | English

Full reference for the application-level variables in the root `.env.example`
— what each one configures and what value to put there. This file does
**not** cover the `*_IMAGE`/`*_HOST_PORT`/`*_CONTAINER_PORT` variables used
by `deploy/compose.yml` to select images and publish ports; those are
covered in [running-ghcr-images.md](./running-ghcr-images.md).

Create a `.env` file at the repo root based on `.env.example`. Names ending
in `_MS` are milliseconds, `_BYTES` are bytes. The backends' loaders also
expand `${VARIABLE_NAME}` references inside `.env` values, e.g.:

```env
BAMBULAB_A1_IP=192.168.1.100
FTPS_REMOTE_MANAGER_FTP_HOST=${BAMBULAB_A1_IP}
```

Values passed directly in the process environment take precedence over
values in `.env`. An unresolved reference is left as literal text and will
usually cause a validation error for that specific configuration; circular
references are rejected.

## Shared authentication

| Variable | What to set |
| --- | --- |
| `CLOUDLESS_AUTH_MODE` | API protection mode: `disabled` turns authentication off, `optional` accepts requests with or without a token, and `required` demands a valid token. |
| `CLOUDLESS_AUTH_SHARED_SECRET` | Shared secret used to sign JWTs. Set the same random value, at least 32 characters long, on every service. |
| `CLOUDLESS_AUTH_SERVICE_ORDER` | Order of trusted services issuing tokens. Comma-separated service names; the first available service is what the dashboard uses to obtain a token. |
| `CLOUDLESS_AUTH_TOKEN_TTL_SECONDS` | Token lifetime in seconds. `86400` is 24 hours. |

## MQTT Puppeteer

| Variable | What to set |
| --- | --- |
| `MQTT_PUPPETEER_HOST` | Interface the backend serves HTTP on. Use `0.0.0.0` for network/container access, or `127.0.0.1` for local-only access. |
| `MQTT_PUPPETEER_PORT` | HTTP port of the MQTT Puppeteer backend. Defaults to `10320`; must be free and match your proxy/container configuration. |
| `MQTT_PUPPETEER_MQTT_HOST` | IP address or hostname of the printer's LAN-mode MQTT broker. |
| `MQTT_PUPPETEER_MQTT_PORT` | Printer's MQTT port. Typically `8883` for Bambu Lab's encrypted connection. |
| `MQTT_PUPPETEER_MQTT_USERNAME` | Printer's MQTT username. Typically `bblp` for Bambu Lab in LAN mode. |
| `MQTT_PUPPETEER_MQTT_PASSWORD` | MQTT password — the printer's LAN access code, read from the printer's own settings. |
| `MQTT_PUPPETEER_PRINTER_SN` | Printer serial number used to build MQTT topics, e.g. `device/<SN>/report`. |
| `MQTT_PUPPETEER_MQTT_REJECT_UNAUTHORIZED` | `true` requires a trusted TLS certificate from the printer; `false` accepts its local or self-signed certificate. |
| `MQTT_PUPPETEER_MQTT_CONNECT_TIMEOUT_MS` | Max time to establish the MQTT connection. `10000` is 10 seconds. |
| `MQTT_PUPPETEER_MQTT_RECONNECT_PERIOD_MS` | Interval between MQTT reconnect attempts. `4000` is 4 seconds. |
| `MQTT_PUPPETEER_MQTT_KEEPALIVE_SECONDS` | MQTT keepalive check frequency, in seconds. Typically `60`. |
| `MQTT_PUPPETEER_OPERATION_TIMEOUT_MS` | Max time to wait for the printer's response after sending a command. `30000` is 30 seconds. |
| `MQTT_PUPPETEER_CORS_ORIGINS` | Allowed dashboard origins (REST and Socket.IO), comma-separated, e.g. `http://localhost:10300,https://dashboard.example.com`. `*` reflects any origin (development only). Defaults to `http://localhost:4200` — **this repo's octo-management-dashboard runs on port `10300` by default** (see `angular.json`), so set `http://localhost:10300` explicitly locally. |
| `MQTT_PUPPETEER_TELEMETRY_HISTORY_CAPACITY` | Number of telemetry samples kept in the ring buffer feeding the dashboard's charts. Defaults to `720`. |

## FTPS Remote Manager

| Variable | What to set |
| --- | --- |
| `FTPS_REMOTE_MANAGER_HOST` | Interface the backend serves HTTP on. Use `0.0.0.0` for network/container access, or `127.0.0.1` for local-only. |
| `FTPS_REMOTE_MANAGER_PORT` | HTTP port of the FTPS backend. Defaults to `10321`; must be free and match your proxy/container configuration. |
| `FTPS_REMOTE_MANAGER_FTP_HOST` | IP address or hostname of the printer's FTPS-exposed SD card. |
| `FTPS_REMOTE_MANAGER_FTP_PORT` | Printer's FTPS port. Typically `990` for implicit FTPS. |
| `FTPS_REMOTE_MANAGER_FTP_USER` | Printer's FTPS username. Typically `bblp` for Bambu Lab. |
| `FTPS_REMOTE_MANAGER_FTP_PASSWORD` | FTPS password — the printer's LAN access code, read from the printer's own settings. |
| `FTPS_REMOTE_MANAGER_FTP_TLS_MODE` | Printer's TLS mode: `implicit` starts encryption immediately, `explicit` upgrades to it after connecting. |
| `FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256` | SHA-256 fingerprint of the printer's FTPS certificate: exactly 64 hex characters; colons optional. Read it from a trusted FTPS client. |
| `FTPS_REMOTE_MANAGER_FTP_TIMEOUT_MS` | Max time to wait for an FTPS operation or connection. `10000` is 10 seconds. |
| `FTPS_REMOTE_MANAGER_FTP_MAX_CONCURRENT_SESSIONS` | Max number of concurrent FTPS sessions. `1` is a safe value for the printer. |
| `FTPS_REMOTE_MANAGER_FTP_UPLOAD_MAX_BYTES` | Max size of an uploaded file. `262144000` is 250 MiB. |

## Video Service Hub

| Variable | What to set |
| --- | --- |
| `VIDEO_SERVICE_HUB_HOST` | Interface the backend serves HTTP on. Use `0.0.0.0` for network/container access, or `127.0.0.1` for local-only. |
| `VIDEO_SERVICE_HUB_PORT` | HTTP port of the video service. Defaults to `10322`; must be free and match your proxy/container configuration. |
| `VIDEO_SERVICE_HUB_STORAGE_PATH` | Directory for recordings, photos, audio, and live streams. Use a path writable by the process; a persistent volume is used in Docker. |
| `VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES` | Max size of a single JPEG photo. `20971520` is 20 MiB. |
| `VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES` | Max size of one MJPEG recording part. `16777216` is 16 MiB. |
| `VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES` | Max size of a single audio file. `10485760` is 10 MiB. |
| `VIDEO_SERVICE_HUB_LIVE_MAX_BYTES` | Max amount of data stored for a single live stream. `1073741824` is 1 GiB. |
| `VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES` | Max buffered data pending for a single live viewer. `2097152` is 2 MiB. |
| `VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS` | Max time to wait for a camera to execute a command. `10000` is 10 seconds. |
| `VIDEO_SERVICE_HUB_MQTT_PORT` | Port of the embedded MQTT broker used by cameras. Defaults to `1883`; `0` is mainly for tests with an auto-assigned port. |
| `VIDEO_SERVICE_HUB_MQTT_CONNECT_TIMEOUT_MS` | Max time to establish the MQTT connection. `10000` is 10 seconds. |
| `VIDEO_SERVICE_HUB_MQTT_RECONNECT_PERIOD_MS` | Interval between MQTT reconnect attempts. `1000` is 1 second. |
| `VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS` | Time since the last message during which a camera is considered online. `60000` is 60 seconds. |

## Related docs

- [running-ghcr-images.md](./running-ghcr-images.md) — running published GHCR images, including the compose-level image/port variables this file doesn't cover.
- [operations.md](./operations.md) — this repo's CI/CD and deployment configuration.
- [architecture.md](./architecture.md) — cross-service architecture map.
