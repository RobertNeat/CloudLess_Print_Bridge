# UnitCamS3 Station Mode Firmware

English | [Polski](README_pl.md)

Firmware for the M5Stack UnitCamS3 (ESP32-S3), built with PlatformIO. It handles
the camera and microphone, Wi-Fi configuration, the local HTTP API, integration
with an external video service, and delivery of the dashboard stored in
LittleFS.

## Functional scope

### Video Service integration

Firmware accepts jobs from a video service running on the same network:

- single and periodic image capture;
- fixed and dynamic MJPEG preview;
- timed and manually stopped MJPEG recordings;
- WAV audio recordings;
- durable file buffering on an SD card with retried HTTP uploads;
- heartbeat, device state, and job state publishing through MQTT;
- priority for Video Service operations over the local dashboard.

Files stored on the SD card are removed only after a confirmed upload. The
protocol is documented most accurately by the implementation in
`src/services/video_service/`.

### Device API

The HTTP server provides camera control, image and status retrieval, microphone,
SD card, LED, and network configuration operations. The exact routes,
parameters, and responses are documented in
[`../docs/rest_endpoints.md`](../docs/rest_endpoints.md).

### Local dashboard

Firmware serves a compressed web application from LittleFS. The dashboard
provides:

- initial device configuration in access-point mode;
- camera preview and control after the device joins the network;
- fixed or automatically adjusted streaming;
- still captures and temperature, FPS, and camera-state monitoring;
- network configuration updates.

If configuration is incomplete or the STA connection cannot be established
within 30 seconds, the device starts an open `UnitCamS3-XXXX` AP at
`http://192.168.1.1`.

## Key technologies

- C++ and the Arduino framework for ESP32-S3;
- PlatformIO with `espressif32@6.4.0`;
- the `esp_camera` driver and PSRAM for image handling;
- AsyncTCP `1.1.1` and ESPAsyncWebServer `1.2.3`, vendored in `lib/`;
- ArduinoJson `6.21.6` and PubSubClient `2.8.0`, pinned in `platformio.ini`;
- LittleFS for configuration and the web application;
- an SD card for media waiting to be uploaded;
- FreeRTOS for operation, upload, and telemetry tasks;
- Mooncake with spdlog `1.12.0`, vendored in the source tree.

## Hardware environment

The `m5stack-unitcams3` configuration uses PlatformIO's `esp32s3box` board,
which is compatible with the UnitCamS3 module:

- 240 MHz CPU;
- 16 MB flash at 80 MHz in QIO mode;
- octal PSRAM;
- custom partition layout from `custom.csv`;
- LittleFS filesystem;
- serial port at 115200 baud.

## Initial configuration

The active configuration is stored as `/config.json` in LittleFS.
`firmware/data/*.json` files are ignored by Git because they can contain SSIDs,
passwords, and private infrastructure addresses.

Recommended first-start procedure:

1. Build the dashboard and upload LittleFS as described below.
2. Flash the firmware and start the device.
3. Connect to the open `UnitCamS3-XXXX` network.
4. Open `http://192.168.1.1` and complete the form.
5. After the restart, return to the target network and open the configured
   camera address.

The device supports 2.4 GHz Wi-Fi and uses a static IPv4 address. Configuration
includes:

- Wi-Fi SSID and password;
- camera address, gateway, subnet mask, and DNS;
- Video Service address and port;
- MQTT broker port;
- heartbeat interval from 5 to 3600 seconds.

Defaults are `255.255.255.0` for the subnet mask, `3000` for the Video Service
port, `1883` for MQTT, and `15` seconds for the heartbeat. When migrating an
older configuration, a missing gateway defaults to `.1` in the camera subnet,
and DNS defaults to the gateway address.

Optionally, create a local `data/config.json` before building. This file must
not be committed:

```json
{
  "schemaVersion": 1,
  "wifiSsid": "YOUR_WIFI_SSID",
  "wifiPass": "YOUR_WIFI_PASSWORD",
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

If LittleFS contains no network configuration, firmware can import compatible
fields once from `/config.json` on the SD card. Configuration saved through the
dashboard takes precedence.

## Requirements

- M5Stack UnitCamS3;
- Python 3 and PlatformIO Core;
- a USB cable that supports data transfer;
- Node.js 18+ and npm when building the dashboard from source.

Check the tools:

```shell
pio --version
node --version
npm --version
```

## Building firmware

From the `firmware/` directory:

```shell
pio run
```

PlatformIO downloads the exact versions declared in `platformio.ini`. Build
artifacts, including `firmware.bin` and `firmware.elf`, are written to
`.pio/build/m5stack-unitcams3/`.

Build only the LittleFS image with:

```shell
pio run --target buildfs
```

## Preparing the dashboard for LittleFS

Build the dashboard in the `web/` directory:

```shell
cd ../web
npm ci
npm run build
```

The build creates `web/dist/index.html.gz`. Copy it into the firmware data
directory.

PowerShell:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

`firmware/data/index.html.gz` is intentionally ignored by Git. Each user of the
public repository should build it locally before running `buildfs` or
`uploadfs`.

## Flashing the device

List available ports:

```shell
pio device list
```

Flash firmware:

```shell
pio run --target upload --upload-port COM5
```

Flash LittleFS:

```shell
pio run --target uploadfs --upload-port COM5
```

On Linux/macOS, replace `COM5` with the appropriate port, such as
`/dev/ttyACM0`. Firmware and LittleFS are independent images: a C++ change
requires `upload`, while a dashboard or local configuration change requires
`uploadfs`.

Monitor the serial port:

```shell
pio device monitor --port COM5 --baud 115200
```

## Runtime security

The server uses HTTP and has no authentication. The access point used for
initial configuration is also open. Configure the device in a controlled
location, use it only on a trusted local network, and do not expose port 80 to
the Internet.
