# UnitCamS3 Local Dashboard

English | [Polski](README_pl.md)

A single-page web application for initial UnitCamS3 configuration and the local
camera dashboard. The build is bundled into one HTML file, compressed with
gzip, and uploaded to the device's LittleFS filesystem.

## Functional scope

In provisioning mode, the application:

- displays a Wi-Fi connection and static IPv4 configuration form;
- configures the Video Service address and port, MQTT port, and heartbeat
  interval;
- saves the configuration and reports the upcoming device restart.

After the camera connects to the network, the dashboard:

- displays camera state, temperature, FPS, resolution, and power state;
- starts a fixed MJPEG stream at a selected resolution;
- starts a dynamic stream that adjusts resolution to temperature and FPS;
- takes a single UXGA image;
- stops the embedded preview or opens an image in a new tab;
- allows the network configuration to be edited again.

The interface supports Polish and English as well as light and dark themes.
Preferences are stored in `localStorage`, but unavailable storage in a captive
portal browser does not prevent the application from working.

## Technologies

Frameworks and tools:

- React `18.2.0` for rendering the interface;
- TypeScript `5.3.2`;
- Vite `5.0.5` with the React plugin;
- Tailwind CSS `3.3.6`, PostCSS, and Autoprefixer;
- `vite-plugin-singlefile` to embed JavaScript and CSS in one HTML file;
- `vite-plugin-compression` to create `index.html.gz`;
- ESLint with TypeScript, React Hooks, and React Refresh rules;
- json-server `0.17.4` as the local mock API.

The project does not use a component framework, router, or state-management
library. Components, forms, AP/STA screen routing, theme handling, and i18n are
implemented directly in React and TypeScript. Styling uses Tailwind utility
classes and hand-written global styles in `src/index.css`.

Direct dependency versions are pinned in `package.json`. The complete
dependency tree and integrity hashes are stored in `package-lock.json`.

## Requirements and installation

- Node.js 18 or newer;
- npm distributed with Node.js.

From the `web/` directory:

```shell
npm ci
```

`npm ci` restores dependencies from `package-lock.json`. After intentionally
updating packages, commit both `package.json` and the updated
`package-lock.json`.

## Local development with the mock API

Use two terminals.

Terminal 1 — json-server:

```shell
cd web
npx json-server --watch json_server/unitcams3.json --port 3000
```

Terminal 2 — Vite:

```shell
cd web
npm run dev
```

Open the address printed by Vite, normally `http://localhost:5173`.

The configuration in `vite.config.ts` proxies `/api` requests to
`http://localhost:3000` and maps them to resources in
`json_server/unitcams3.json`. The mock supports development of the AP screen,
STA screen, configuration form, and camera status. It does not generate binary
MJPEG, JPEG, or WAV responses, so image and audio features require a real
device.

Mock state and sample data are stored in:

```text
json_server/unitcams3.json
```

## Local development with a real device

The current Vite proxy is designed for json-server. To send requests to a
camera, temporarily set the device address in `vite.config.ts` and remove
`rewrite`:

```ts
server: {
  proxy: {
    "/api": {
      target: "http://192.168.1.231",
      changeOrigin: true,
    },
  },
},
```

Do not commit a private test address as the project default. To make the Vite
server available to another computer on the LAN:

```shell
npm run dev -- --host 0.0.0.0
```

Alternatively, build the application and test it directly from the device's
LittleFS filesystem.

## Available commands

| Command | Action |
|---|---|
| `npm run dev` | starts Vite with HMR |
| `npm run lint` | runs ESLint; warnings fail the command |
| `npm run build` | runs TypeScript and the production Vite build |
| `npm run preview` | previews the contents of `dist/` locally |

Recommended checks before committing changes:

```shell
npm run lint
npm run build
```

## Production build

```shell
npm run build
```

Output:

```text
dist/
|-- index.html
|-- index.html.gz
`-- camera_icon.png
```

Firmware uses `index.html.gz`. The uncompressed `index.html` is intended for
local inspection and preview.

## Uploading the dashboard to the device

Copy the compressed build into the firmware data directory.

PowerShell, from the `web/` directory:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

Then build and upload the LittleFS image:

```shell
cd ../firmware
pio run --target buildfs
pio run --target uploadfs
```

Running `npm run build` alone does not update the device. The `upload` target
flashes firmware code but does not replace LittleFS; use `uploadfs` for the
dashboard. The generated `firmware/data/index.html.gz` is ignored by Git.

## Code structure

```text
src/
|-- components/
|   |-- app-header.tsx            language and theme
|   |-- camera-dashboard.tsx      status, stream, and captures
|   `-- network-config-form.tsx   provisioning and STA configuration
|-- routes/page-root.tsx          AP/STA screen selection
|-- i18n.ts                       Polish and English strings
|-- types.ts                      firmware data types
|-- index.css                     Tailwind and global styles
`-- main.tsx                      application entry point
```
