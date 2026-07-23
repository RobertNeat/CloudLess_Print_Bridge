# UnitCamS3 Firmware HTTP/REST Endpoints

English | [Polski](rest_endpoints_pl.md)

This document describes the routes actually registered by the firmware and the
payloads produced by the current implementation. The dashboard and API use the
same HTTP server on port `80`.

## Base address and general rules

- Provisioning AP mode: `http://192.168.1.1` (SSID `UnitCamS3-XXXX`).
- Station mode: `http://{unitCamIp}`, for example `http://192.168.1.231`.
- Firmware uses neither HTTPS nor user authentication.
- Integration routes under `POST /api/v1/video-service/*` are protected only by
  checking whether the source IPv4 address equals the configured
  `videoServiceIp`.
- JSON POST payloads require `Content-Type: application/json`.
- The dashboard form requires
  `Content-Type: application/x-www-form-urlencoded`.
- The `t` parameter added by the dashboard is only a cache buster and is ignored
  by firmware.
- The camera supports only one owner or stream at a time. Video Service jobs
  have priority and may close a dashboard stream.

Supported resolution values:

| `framesize` | Name | Dimensions |
|---:|---|---:|
| `5` | QVGA | 320 x 240 |
| `8` | VGA | 640 x 480 |
| `9` | SVGA | 800 x 600 |
| `10` | XGA | 1024 x 768 |
| `13` | UXGA | 1600 x 1200 |

## 1. Web application URLs

| Method | URL | Response |
|---|---|---|
| GET | `/` | Dashboard from `/index.html.gz`, `text/html`, with `Content-Encoding: gzip` |
| GET | `/index.html` | The same dashboard |
| GET | `/camera_icon.png` | Static icon from LittleFS |
| GET | any unknown path | `302` to `/` (React/captive portal fallback) |

The server also has a general `serveStatic("/", LittleFS, "/")` mapping.
Consequently, any file in the LittleFS root directory may become available at a
public URL.

> **Security risk:** the current server configuration allows
> `GET /config.json`. This is the same file in which firmware stores
> `wifiPass`, among other values. `/api/v1/get_config` correctly returns an
> empty password, but the static mapping can bypass that protection. This path
> should be blocked, or the static handler should be limited to public assets.

## 2. Endpoints used directly by the dashboard

The dashboard uses the following six routes. They are also available to other
HTTP clients without authentication.

### `GET /api/v1/get_config`

Returns the configuration needed to render either provisioning mode or the
camera dashboard. The request has no payload.

`200 application/json` response:

```json
{
  "wifiSsid": "network-name",
  "wifiPass": "",
  "cameraMacAddress": "AA:BB:CC:DD:EE:FF",
  "unitCamIp": "192.168.1.231",
  "gatewayIp": "192.168.1.1",
  "subnetMask": "255.255.255.0",
  "dnsIp": "192.168.1.1",
  "videoServiceIp": "192.168.1.100",
  "videoServicePort": 3000,
  "mqttPort": 1883,
  "heartbeatIntervalSeconds": 15,
  "mode": "station",
  "currentIp": "192.168.1.231"
}
```

`mode` is either `ap` or `station`. `wifiPass` is always an empty string.

### `POST /api/v1/set_config_form`

The native HTML form used by the dashboard.

```http
Content-Type: application/x-www-form-urlencoded

wifiSsid=MyWiFi&wifiPass=secret&unitCamIp=192.168.1.231&gatewayIp=192.168.1.1&subnetMask=255.255.255.0&dnsIp=192.168.1.1&videoServiceIp=192.168.1.100&videoServicePort=3000&mqttPort=1883&heartbeatIntervalSeconds=15
```

Fields required by the handler are `wifiSsid`, `wifiPass`, `unitCamIp`, and
`videoServiceIp`. The dashboard also sends all remaining fields shown in the
example. A successful response is `200 text/html` with a confirmation page;
the device restarts after about three seconds. Validation errors return
`400 text/plain`, and a persistence failure returns `500 text/plain`.

Password persistence rules:

- an empty `wifiPass` with an unchanged SSID retains the current password;
- an empty `wifiPass` with a changed SSID stores an empty password.

### `GET /api/v1/camera/runtime?t={timestamp}`

The dashboard polls this route every three seconds.

```json
{
  "streaming": false,
  "cameraPowered": false,
  "dynamic": false,
  "fps": 0,
  "maxFps": 25,
  "framesize": 8,
  "temperature": 46.5
}
```

`temperature` may be `null`. `framesize` is a numeric value from the resolution
table. Response: `200 application/json`.

### `GET /api/v1/stream?framesize={5|8|9|10|13}`

Fixed MJPEG stream used by the dashboard preview.

- request payload: none; optional `framesize` query parameter;
- success: `200 multipart/x-mixed-replace; boundary=123456789000000000000987654321`;
- each part has `Content-Type: image/jpeg` and `Content-Length`;
- `400 {"msg":"unsupported framesize"}` for an unsupported value;
- `409 {"msg":"camera is already streaming"}` when the camera is busy;
- `503 {"msg":"camera unavailable"}` when the camera cannot be started.

Without the parameter, the stream uses the sensor's current setting. Maximum
stream rate is 25 FPS.

### `GET /api/v1/stream/dynamic`

Dynamic MJPEG stream. It starts at UXGA and automatically selects a resolution
based on temperature and capture state. Its successful response has the same
format as the fixed stream. Typical errors are `409`, `503`, and `501`.

### `GET /api/v1/capture/uxga`

A single verified 1600 x 1200 JPEG image.

- request payload: none;
- optional settings query parameters: `brightness=-2..2`, `contrast=-2..2`,
  `compressionLevel=4..63`, and `rotation=0|180`;
- a lower `compressionLevel` means less JPEG compression and a larger file;
- success: `200 image/jpeg`;
- `400 {"error":"invalid_capture_settings"}` for invalid settings;
- `409` when the camera is busy;
- `503` when capture fails; firmware may schedule a camera restart.

## 3. Direct firmware API

### 3.1 Camera

#### `GET /api/v1/capture`

A single JPEG at the current or requested resolution.

```http
GET /api/v1/capture?framesize=8&brightness=0&contrast=0&compressionLevel=12&rotation=0
```

Settings and error codes are the same as for `/capture/uxga`. `framesize` is
optional, but when present it must be one of the five supported values.

#### `GET /api/v1/stream/dynamic/status`

Dynamic stream algorithm state:

```json
{
  "temperature": 52.1,
  "framesize": 10
}
```

`temperature` may be `null`. Response: `200 application/json`.

#### `GET /api/v1/status`

Complete sensor state. Success: `200 application/json`.

```json
{
  "framesize": 8,
  "compressionLevel": 12,
  "brightness": 0,
  "contrast": 0,
  "saturation": 0,
  "sharpness": 0,
  "special_effect": 0,
  "wb_mode": 0,
  "awb": 1,
  "awb_gain": 1,
  "aec": 1,
  "aec2": 0,
  "denoise": 0,
  "ae_level": 0,
  "aec_value": 300,
  "agc": 1,
  "agc_gain": 0,
  "gainceiling": 0,
  "bpc": 0,
  "wpc": 1,
  "raw_gma": 1,
  "lenc": 1,
  "hmirror": 0,
  "vflip": 0,
  "dcw": 1,
  "colorbar": 0
}
```

Possible errors are `503` when the camera is busy or unavailable, and `501`
when no sensor is available.

#### `GET /api/v1/control?var={name}&val={number}`

Changes one sensor property. The request has no body. Supported names:

`framesize`, `compressionLevel`, `contrast`, `brightness`, `saturation`,
`sharpness`, `gainceiling`, `colorbar`, `awb`, `agc`, `aec`, `hmirror`,
`vflip`, `awb_gain`, `agc_gain`, `aec_value`, `aec2`, `denoise`, `dcw`, `bpc`,
`wpc`, `raw_gma`, `lenc`, `special_effect`, `wb_mode`, `ae_level`.

Success returns an empty `200` response. Missing parameters or an unknown name
return `404`. Changing `framesize` during a stream returns `409`, while an
unsupported resolution returns `400`. For settings other than `framesize`, the
handler passes the value to the sensor driver but still responds with `200`
even if the driver reports an error.

The `/capture*`, `/stream*`, `/status`, and `/control` routes add
`Access-Control-Allow-Origin: *`. Other API groups do not set CORS.

### 3.2 Configuration and system diagnostics

#### `POST /api/v1/set_config`

JSON equivalent of the dashboard form:

```json
{
  "wifiSsid": "MyWiFi",
  "wifiPass": "secret",
  "unitCamIp": "192.168.1.231",
  "gatewayIp": "192.168.1.1",
  "subnetMask": "255.255.255.0",
  "dnsIp": "192.168.1.1",
  "videoServiceIp": "192.168.1.100",
  "videoServicePort": 3000,
  "mqttPort": 1883,
  "heartbeatIntervalSeconds": 15
}
```

Required keys are `wifiSsid`, `wifiPass`, `unitCamIp`, and `videoServiceIp`.
The remaining keys are optional. A missing or empty address retains its current
value, and a port or interval value of `0` also retains its current value.

Validation covers an SSID of 1 to 32 characters, a password of up to 64
characters, valid non-zero IPv4 addresses, and a
`heartbeatIntervalSeconds` value from 5 to 3600. Success:

```json
{"msg":"ok","restarting":true}
```

The device restarts after about three seconds. Errors are `400` with
`missing config fields` or `bad config`, and `500` with
`config persistence failed`.

#### Other system routes

| Method and URL | Payload | Success | Errors/notes |
|---|---|---|---|
| `GET /api/v1/get_mac` | none | `200 {"msg":"ok","mac":"AA:BB:CC:DD:EE:FF"}` | — |
| `GET /api/v1/get_wifi_list` | none | `200 {"wifiList":["SSID-1","SSID-2"]}` | up to 20 entries; scanning is synchronous |
| `GET /api/v1/reset_config` | none | `200 {"msg":"ok"}` | stores defaults; **does not restart**; `500` on persistence failure |
| `GET /api/v1/led_on` | none | `200 {"msg":"ok"}` | turns the LED on and publishes an MQTT event |
| `GET /api/v1/led_off` | none | `200 {"msg":"ok"}` | turns the LED off and publishes an MQTT event |
| `GET /api/v1/check_sdcard` | none | `200 {"info":"Type: SDHC  Size: 32G"}` | a missing or invalid card also returns `200` with `SD Card Not Valid`; `409 {"error":"sd_card_busy"}` during a Video Service job |
| `GET /api/v1/sdcard/files?path=/&offset=0&limit=100&depth=2` | none | recursive file and directory listing | `400`, `404`, `409`, `500`, or `503`; `limit` 1..250, `depth` 0..8 |
| `GET /api/v1/sdcard/usage` | none | card usage in bytes and percent | `409` during a Video Service job; `503` when the card is unavailable |

The listing traverses recursively from the directory specified by `path`.
`depth=0` returns only its direct contents, `depth=1` descends by one directory
level, and the maximum is `8`. The `offset` and `limit` pagination values apply
globally to depth-first traversal order:

```json
{
  "path": "/captures",
  "offset": 0,
  "limit": 100,
  "depth": 2,
  "entries": [
    {"name":"capture-001_VGA","path":"/captures/capture-001_VGA","parentPath":"/captures","type":"directory","depth":0},
    {"name":"image.jpg","path":"/captures/capture-001_VGA/image.jpg","parentPath":"/captures/capture-001_VGA","type":"file","depth":1,"sizeBytes":12345}
  ],
  "returned": 2,
  "hasMore": false
}
```

When `hasMore` is `true`, the response includes `nextOffset`. Each entry has a
`depth` relative to the starting directory's contents and a `parentPath`, so
the structure remains unambiguous across pages. Paths must be absolute and
cannot contain `..` or backslashes.

Usage statistics:

```json
{
  "usedBytes": 1073741824,
  "totalBytes": 31914983424,
  "freeBytes": 30841241600,
  "usagePercent": 3.364
}
```

### 3.3 Microphone

#### `GET /api/v1/mic_start?seconds={1..20}`

Starts an asynchronous WAV recording to `/wav/rec.wav` in LittleFS. `seconds`
is optional and defaults to `4`.

- `202 {"status":"accepted"}` — recording started;
- `400 {"error":"seconds_must_be_1_to_20"}`;
- `409 {"error":"microphone_busy"}`;
- `503 {"error":"recording_task_unavailable"}`.

#### `GET /api/v1/mic_is_recording`

Returns `200 {"recording":true}` or `200 {"recording":false}`.

## 4. Commands from Video Service to firmware

All POST requests below are asynchronous. Success means that the job was
accepted, not completed:

```json
{"status":"accepted","requestId":"req-001"}
```

Common rules:

- `requestId`: 1 to 64 characters; letters, digits, `.`, `_`, and `-`;
  the values `.` and `..` are forbidden;
- `resolution`: `QVGA`, `VGA`, `SVGA`, `XGA`, or `UXGA`;
- maximum regular operation duration: 3,600,000 ms (1 h);
- maximum live duration: 600,000 ms (10 min);
- a request from an IP other than `videoServiceIp` returns
  `403 {"error":"video_service_only"}`;
- an invalid payload returns `400`; a busy camera or device returns `409`.

### `POST /api/v1/video-service/captures`

```json
{
  "requestId": "capture-001",
  "resolution": "UXGA"
}
```

Captures a single JPEG, stores it on the SD card, and adds it to the durable
upload queue.

### `POST /api/v1/video-service/captures/periodic`

```json
{
  "requestId": "periodic-001",
  "resolution": "VGA",
  "intervalMs": 1000,
  "durationMs": 60000
}
```

`intervalMs` must be at least `250`; `durationMs` must be in
`1..3600000`. An interval that is too short returns
`400 {"error":"interval_too_short"}`.

### `POST /api/v1/video-service/recordings/timed`

```json
{
  "requestId": "recording-001",
  "resolution": "VGA",
  "durationMs": 30000
}
```

`durationMs`: `1..3600000`. The MJPEG recording is split into parts of
approximately 8 MiB and stored on the SD card before upload.

### `POST /api/v1/video-service/recordings/start`

```json
{
  "requestId": "manual-001",
  "resolution": "SVGA",
  "maxDurationMs": 3600000
}
```

`maxDurationMs` is optional and defaults to one hour. When present, it must be
greater than zero and no greater than one hour.

### `POST /api/v1/video-service/recordings/stop`

```json
{"requestId":"manual-001"}
```

`requestId` is optional; `{}` stops the current manual recording. Success:
`202 {"status":"stopping"}`. If no matching job exists:
`404 {"error":"operation_not_found"}`.

### `POST /api/v1/video-service/live/start`

```json
{
  "requestId": "live-001",
  "resolution": "VGA",
  "maxDurationMs": 600000
}
```

`maxDurationMs` is optional and defaults to 10 minutes. A value greater than
10 minutes is clamped to 10 minutes; zero is an error. Firmware initiates an
MJPEG connection to the Video Service ingest.

### `POST /api/v1/video-service/live/dynamic/start`

```json
{
  "requestId": "dynamic-live-001",
  "maxDurationMs": 600000
}
```

`resolution` is optional and defaults to `UXGA`. All other rules are the same
as for `/live/start`.

### `POST /api/v1/video-service/live/stop`

```json
{"requestId":"live-001"}
```

`requestId` is optional. Success: `202 {"status":"stopping"}`; no matching live
job: `404 {"error":"operation_not_found"}`.

### `POST /api/v1/video-service/audio`

```json
{
  "requestId": "audio-001",
  "durationSeconds": 8
}
```

`durationSeconds` must be an integer in `1..20`. Errors:
`400 {"error":"invalid_request"}`,
`400 {"error":"invalid_audio_request"}`, or
`409 {"error":"device_busy"}`.

### `GET /api/v1/video-service/status`

Unlike the POST commands, this endpoint **does not check the source IP**.

```json
{
  "operation": "idle",
  "lastOperationError": "none",
  "framesCaptured": 0,
  "uploadsSucceeded": 0,
  "uploadsFailed": 0,
  "uploadActive": false,
  "videoServiceReachable": false,
  "mqtt": {
    "brokerAddress": "192.168.1.100",
    "brokerPort": 1883,
    "connected": false,
    "state": -1,
    "lastConnectAttemptAtMs": 0,
    "lastPublishAtMs": 0,
    "lastPublishSucceeded": false
  }
}
```

Possible `operation` values are `idle`, `singleCapture`, `periodicCapture`,
`timedRecording`, `manualRecording`, `audioRecording`, and `liveStream`.

## 5. Route summary

Firmware registers 29 unique `/api/v1/*` routes:

- 8 camera routes;
- 9 system and configuration routes;
- 2 microphone routes;
- 10 Video Service integration routes.

The dashboard actively uses 6 of these routes: `get_config`,
`set_config_form`, `camera/runtime`, `stream`, `stream/dynamic`, and
`capture/uxga`. The remaining routes provide programmatic or diagnostic access,
or the Video Service integration interface.
