# Lokalny dashboard UnitCamS3

[English](README.md) | Polski

Jednostronicowa aplikacja webowa obsługująca pierwszą konfigurację UnitCamS3
oraz lokalny dashboard kamery. Build jest pakowany do pojedynczego pliku HTML,
kompresowany gzipem i wgrywany do LittleFS urządzenia.

## Zakres funkcjonalny

W trybie provisioning aplikacja:

- wyświetla formularz połączenia Wi-Fi i statycznej konfiguracji IPv4;
- pozwala ustawić adres i port Video Service, port MQTT oraz interwał heartbeat;
- zapisuje konfigurację, po czym informuje o restarcie urządzenia.

Po połączeniu kamery z siecią dashboard:

- pokazuje stan kamery, temperaturę, FPS, rozdzielczość i zasilanie;
- uruchamia stały stream MJPEG w wybranej rozdzielczości;
- uruchamia dynamiczny stream dopasowujący rozdzielczość do temperatury i FPS;
- wykonuje pojedyncze zdjęcie UXGA;
- pozwala zatrzymać osadzony podgląd lub otworzyć obraz w nowej karcie;
- umożliwia ponowną edycję konfiguracji sieciowej.

Interfejs ma wersję polską i angielską oraz jasny i ciemny motyw. Preferencje są
zapisywane w `localStorage`, ale jego brak w przeglądarce captive portal nie
blokuje działania aplikacji.

## Technologie

Frameworki i narzędzia:

- React `18.2.0` do renderowania interfejsu;
- TypeScript `5.3.2`;
- Vite `5.0.5` z pluginem React;
- Tailwind CSS `3.3.6`, PostCSS i Autoprefixer;
- `vite-plugin-singlefile` do osadzenia JS i CSS w jednym HTML;
- `vite-plugin-compression` do utworzenia `index.html.gz`;
- ESLint z regułami TypeScript, React Hooks i React Refresh;
- json-server `0.17.4` jako lokalne mock API.

Projekt nie używa frameworka komponentów, routera ani biblioteki zarządzania
stanem. Komponenty, formularze, routing ekranu AP/STA, motyw i mechanizm i18n są
zaimplementowane bezpośrednio w React i TypeScript. Stylowanie opiera się na
klasach Tailwind oraz ręcznych stylach globalnych w `src/index.css`.

Wersje bezpośrednich zależności są przypięte w `package.json`, a pełne drzewo
zależności wraz z sumami kontrolnymi znajduje się w `package-lock.json`.

## Wymagania i instalacja

- Node.js 18 lub nowszy;
- npm dostarczony z Node.js.

Z katalogu `web/`:

```shell
npm ci
```

`npm ci` odtwarza zależności z `package-lock.json`. Po celowej aktualizacji
pakietów należy zatwierdzić równocześnie `package.json` i zaktualizowany
`package-lock.json`.

## Praca lokalna z mock API

Uruchom dwa terminale.

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

Otwórz adres wypisany przez Vite, domyślnie `http://localhost:5173`.

Konfiguracja w `vite.config.ts` przekazuje żądania `/api` do
`http://localhost:3000` i mapuje je na zasoby zapisane w
`json_server/unitcams3.json`. Mock pozwala rozwijać ekran AP, ekran STA,
formularz i status kamery. Nie generuje binarnych odpowiedzi MJPEG, JPEG ani
WAV, dlatego funkcje obrazu i audio wymagają prawdziwego urządzenia.

Stan oraz przykładowe dane mocka można zmieniać w:

```text
json_server/unitcams3.json
```

## Praca lokalna z prawdziwym urządzeniem

Bieżący proxy Vite jest przeznaczony dla json-server. Aby kierować żądania do
kamery, tymczasowo ustaw adres urządzenia w `vite.config.ts` i usuń `rewrite`:

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

Nie zatwierdzaj prywatnego adresu testowego jako ustawienia projektu. Jeżeli
serwer Vite ma być dostępny z innego komputera w LAN:

```shell
npm run dev -- --host 0.0.0.0
```

Alternatywą jest zbudowanie aplikacji i testowanie jej bezpośrednio z LittleFS
urządzenia.

## Dostępne polecenia

| Polecenie | Działanie |
|---|---|
| `npm run dev` | uruchamia Vite z HMR |
| `npm run lint` | sprawdza kod ESLintem; ostrzeżenia kończą zadanie błędem |
| `npm run build` | uruchamia TypeScript i produkcyjny build Vite |
| `npm run preview` | pokazuje lokalny podgląd katalogu `dist/` |

Kontrola przed zatwierdzeniem zmian:

```shell
npm run lint
npm run build
```

## Build produkcyjny

```shell
npm run build
```

Wynik:

```text
dist/
|-- index.html
|-- index.html.gz
`-- camera_icon.png
```

Firmware używa `index.html.gz`. Nieskompresowany `index.html` służy do lokalnej
inspekcji i podglądu.

## Wgranie dashboardu na urządzenie

Skopiuj skompresowany build do katalogu danych firmware.

PowerShell, z katalogu `web/`:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

Następnie zbuduj i wgraj obraz LittleFS:

```shell
cd ../firmware
pio run --target buildfs
pio run --target uploadfs
```

Samo `npm run build` nie aktualizuje urządzenia. Target `upload` wgrywa kod
firmware, ale nie zastępuje zawartości LittleFS; do dashboardu służy `uploadfs`.
Wygenerowany `firmware/data/index.html.gz` jest ignorowany przez Git.

## Struktura kodu

```text
src/
|-- components/
|   |-- app-header.tsx            język i motyw
|   |-- camera-dashboard.tsx      status, stream i zdjęcia
|   `-- network-config-form.tsx   provisioning i konfiguracja STA
|-- routes/page-root.tsx          wybór ekranu AP/STA
|-- i18n.ts                       teksty PL/EN
|-- types.ts                      typy danych firmware
|-- index.css                     Tailwind i style globalne
`-- main.tsx                      punkt wejścia aplikacji
```
