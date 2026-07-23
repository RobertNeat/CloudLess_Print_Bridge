# M5_Stack_UnitCam_S3

English | [Polski](README_pl.md)

Firmware and a web dashboard for the M5Stack UnitCamS3 camera (ESP32-S3). The
project starts the device as a Wi-Fi provisioning access point (AP) and, after
configuration, connects it as a station (STA) with a static IPv4 address. The
same HTTP server provides the dashboard, MJPEG preview, still captures, and
diagnostic APIs.

> This variant targets the standard UnitCamS3. For the UnitCAM S3 5MP, upstream
> provides a separate `unitcams3-5mp` branch.

## Current functionality

- provisioning through an open `UnitCamS3-XXXX` AP at
  `http://192.168.1.1`;
- STA mode with a static IP address and automatic fallback to AP if the
  connection cannot be established within 30 seconds;
- Polish and English UI with light and dark themes;
- fixed MJPEG streaming in QVGA, VGA, SVGA, XGA, or UXGA at up to 25 FPS;
- dynamic MJPEG streaming that adjusts resolution to temperature and FPS;
- a single JPEG capture always produced at UXGA 1600 x 1200, with stale frames
  from a previous stream resolution discarded;
- temperature, resolution, FPS, camera power, and stream status;
- on-demand camera power with shutdown after the last user releases it;
- Wi-Fi modem power saving while STA is idle, disabled during streaming;
- test APIs for the LED, SD card, and microphone;
- a single compressed dashboard file served from LittleFS.

The active user interface covers provisioning and the camera dashboard.
Firmware also provides prioritized operations for a NestJS video service:
single and periodic captures, fixed and dynamic live MJPEG, segmented MJPEG
recordings, and a durable SD queue that removes files only after an HTTP `2xx`
response. MQTT telemetry reports heartbeats, hardware state, job state, and
upload results. The integration implementation is located in
`firmware/src/services/video_service/`.

The camera supports 2.4 GHz Wi-Fi networks. After a failed 30-second connection
attempt it returns to provisioning AP mode. Changing
`firmware/data/config.json` requires uploading LittleFS with
`pio run --target uploadfs`; uploading firmware alone does not replace a
configuration already stored on the device.

## Repository structure

```text
.
|-- firmware/             PlatformIO, Arduino/ESP32, APIs, and LittleFS image
|   |-- data/             files included in the LittleFS image
|   |-- include/          project header files
|   |-- lib/              libraries vendored in the repository
|   |-- src/              firmware, HAL, servers, and API implementation
|   |-- custom.csv        flash partition layout
|   `-- platformio.ini    m5stack-unitcams3 environment
`-- web/                  React + TypeScript + Vite + Tailwind
    |-- json_server/      mock API data for development
    |-- public/           static assets
    `-- src/              web application
```

Further documentation:

- [firmware/README.md](firmware/README.md) — device functionality,
  configuration, building, and flashing;
- [web/README.md](web/README.md) — running the UI, mock API, building, and
  integrating the result with LittleFS;
- [docs/rest_endpoints.md](docs/rest_endpoints.md) — HTTP API routes and
  responses.

## Requirements

- M5Stack UnitCamS3 with 16 MB flash and PSRAM;
- a USB cable that supports data transfer;
- Python 3 and PlatformIO Core (`pio`);
- Node.js 18+ and npm;
- an IPv4 `/24` network when running the device in STA mode.

Install the tools if they are not available:

```shell
python -m pip install -U platformio
node --version
npm --version
pio --version
```

## Quick start on a device

### 1. Build the web dashboard

```shell
cd web
npm ci
npm run lint
npm run build
```

### 2. Copy the dashboard into the LittleFS image

PowerShell:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

### 3. Build and flash firmware and LittleFS

```shell
cd ../firmware
pio run
pio run --target upload
pio run --target uploadfs
```

If PlatformIO does not select the correct port, add, for example,
`--upload-port COM5` on Windows or `--upload-port /dev/ttyACM0` on Linux.

Firmware and LittleFS are independent images. After changing the web
application, rebuild it, copy `index.html.gz`, and run `uploadfs` again.

### 4. Configure the device

1. Connect a computer or phone to the open `UnitCamS3-XXXX` network.
2. Open `http://192.168.1.1`.
3. Enter the SSID, password, static camera address, and video service address.
4. Save the form. The response is sent before the device restarts after about
   three seconds.
5. Return to the target Wi-Fi network and open the configured camera address.

The device assumes the `255.255.255.0` subnet mask. The gateway and DNS default
to `.1` in the same subnet. For example, `192.168.10.231` uses
`192.168.10.1` as the gateway and DNS address.

## Development

Firmware:

```shell
cd firmware
pio run
pio device monitor --baud 115200
```

Run the dashboard and its local mock API in two terminals:

```shell
cd web
npx json-server --watch json_server/unitcams3.json --port 3000
```

```shell
cd web
npm run dev
```

Open the address printed by Vite, usually `http://localhost:5173`. The mock
supports status and basic configuration calls, but it does not generate real
MJPEG, images, or audio.

## API

[docs/rest_endpoints.md](docs/rest_endpoints.md) describes the local HTTP API
routes, parameters, responses, and error codes. The Video Service integration
implementation remains the source of truth for its protocol.

## Security and limitations

- the provisioning AP is open, and the HTTP API has neither authentication nor
  TLS;
- the device should only be used on a trusted local network, without forwarding
  port 80 to the Internet;
- the Wi-Fi password is stored locally in `config.json`, but the configuration
  API returns an empty password and logs do not print it;
- only one camera stream can be active; concurrent camera use may return HTTP
  `409`;
- the current partition layout does not provide an application-level OTA
  mechanism, so firmware and LittleFS are flashed through PlatformIO and USB;
- Video Service job results require an SD card; without one, firmware reports a
  job error and does not attempt to retain the media in RAM.

## Pre-release checks

```shell
cd web
npm run lint
npm run build

cd ../firmware
pio run
pio run --target buildfs
```

After hardware-related changes, test the first boot and AP mode, saving the
configuration, restarting into STA mode, every stream resolution, still
capture, return to power-saving mode after closing a stream, and, where
applicable, the microphone and SD card.
