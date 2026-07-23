# M5_Stack_UnitCam_S3

[English](README.md) | Polski

Firmware i panel webowy dla kamery M5Stack UnitCamS3 (ESP32-S3). Projekt uruchamia
urządzenie jako punkt konfiguracyjny Wi-Fi (AP), a po zapisaniu konfiguracji jako
stację (STA) ze statycznym adresem IPv4. Ten sam serwer HTTP udostępnia panel,
podgląd MJPEG, pojedyncze zdjęcia i API diagnostyczne.

> Ten wariant jest przeznaczony dla standardowej UnitCamS3. Dla UnitCAM S3 5MP
> upstream udostępnia osobną gałąź `unitcams3-5mp`.

## Stan bieżącej implementacji

- provisioning przez otwarty AP `UnitCamS3-XXXX` pod `http://192.168.1.1`;
- przejście do STA ze statycznym adresem IP i automatyczny powrót do AP, jeśli
  połączenie nie powiedzie się w ciągu 30 sekund;
- polski i angielski interfejs oraz jasny/ciemny motyw;
- stały stream MJPEG w QVGA, VGA, SVGA, XGA albo UXGA, maksymalnie 25 FPS;
- dynamiczny stream MJPEG dostosowujący rozdzielczość do temperatury i FPS;
- pojedyncze zdjęcie JPEG zawsze w UXGA 1600 x 1200; klatki pozostałe po
  streamie w innej rozdzielczości są odrzucane;
- status temperatury, rozdzielczości, FPS, zasilania kamery i streamu;
- kamera włączana na żądanie i wyłączana po zwolnieniu ostatniego użytkownika;
- oszczędzanie modemu Wi-Fi w bezczynnym STA, wyłączane na czas streamu;
- API testowe dla LED, karty SD i mikrofonu;
- panel zbudowany jako pojedynczy, skompresowany plik HTML w LittleFS.

Aktywny interfejs użytkownika obejmuje provisioning oraz dashboard kamery.
Firmware udostępnia również priorytetowe operacje dla usługi NestJS: zdjęcia
pojedyncze i cykliczne, statyczny i dynamiczny live MJPEG, segmentowane nagrania
MJPEG oraz trwałą kolejkę SD usuwającą pliki dopiero po HTTP `2xx`. Telemetria
MQTT obejmuje heartbeat, stany sprzętu, zadania i wynik uploadu. Implementacja
integracji znajduje się w `firmware/src/services/video_service/`.

Kamera obsługuje sieci Wi-Fi 2,4 GHz. Po nieudanej próbie połączenia przez 30 s
wraca do AP provisioning. Zmiana `firmware/data/config.json` wymaga wgrania
LittleFS (`pio run --target uploadfs`); zwykły upload firmware nie zastępuje
konfiguracji zapisanej wcześniej w pamięci urządzenia.

## Struktura repozytorium

```text
.
|-- firmware/             PlatformIO, Arduino/ESP32, API i obraz LittleFS
|   |-- data/             pliki wgrywane do LittleFS
|   |-- include/          pliki nagłówkowe projektu
|   |-- lib/              biblioteki dołączone do repozytorium
|   |-- src/              firmware, HAL, serwery i endpointy
|   |-- custom.csv        układ partycji flash
|   `-- platformio.ini    środowisko m5stack-unitcams3
`-- web/                  React + TypeScript + Vite + Tailwind
    |-- json_server/      dane mock API dla developmentu
    |-- public/           zasoby statyczne
    `-- src/              aplikacja webowa
```

Szczegóły:

- [firmware/README_pl.md](firmware/README_pl.md) — architektura urządzenia, konfiguracja,
  funkcjonalności, kompilacja i wgrywanie;
- [web/README_pl.md](web/README_pl.md) — uruchamianie UI, mock API, build i integracja
  wyniku z LittleFS;
- [docs/rest_endpoints_pl.md](docs/rest_endpoints_pl.md) — trasy i odpowiedzi API HTTP.

## Wymagania

- M5Stack UnitCamS3 z 16 MB flash i PSRAM;
- przewód USB umożliwiający transmisję danych;
- Python 3 oraz PlatformIO Core (`pio`);
- Node.js 18+ i npm;
- sieć IPv4 `/24`, jeżeli urządzenie ma pracować w STA.

Instalacja narzędzi, jeśli nie są jeszcze dostępne:

```shell
python -m pip install -U platformio
node --version
npm --version
pio --version
```

## Szybki start na urządzeniu

### 1. Zbuduj panel webowy

```shell
cd web
npm ci
npm run lint
npm run build
```

### 2. Skopiuj panel do obrazu LittleFS

PowerShell:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

### 3. Zbuduj i wgraj firmware oraz LittleFS

```shell
cd ../firmware
pio run
pio run --target upload
pio run --target uploadfs
```

Jeżeli PlatformIO nie wybierze właściwego portu, dodaj na przykład
`--upload-port COM5` (Windows) albo `--upload-port /dev/ttyACM0` (Linux).

Firmware i LittleFS są niezależnymi obrazami. Po zmianie aplikacji webowej trzeba
ponownie wykonać build web, skopiować `index.html.gz` i uruchomić `uploadfs`.

### 4. Skonfiguruj urządzenie

1. Połącz komputer lub telefon z otwartą siecią `UnitCamS3-XXXX`.
2. Otwórz `http://192.168.1.1`.
3. Podaj SSID, hasło, statyczny adres kamery i adres usługi wideo.
4. Zapisz formularz. Odpowiedź jest wysyłana przed restartem, który następuje po
   około 3 sekundach.
5. Wróć do docelowej sieci Wi-Fi i otwórz skonfigurowany adres kamery.

Urządzenie zakłada maskę `255.255.255.0`. Brama i DNS są wyliczane jako adres
`.1` w tej samej podsieci. Przykład: dla `192.168.10.231` użyta zostanie brama
i DNS `192.168.10.1`.

## Development

Firmware:

```shell
cd firmware
pio run
pio device monitor --baud 115200
```

Panel webowy z lokalnym mock API uruchamia się w dwóch terminalach:

```shell
cd web
npx json-server --watch json_server/unitcams3.json --port 3000
```

```shell
cd web
npm run dev
```

Otwórz adres wypisany przez Vite, zwykle `http://localhost:5173`. Mock obsługuje
status i podstawowe endpointy konfiguracyjne; nie generuje prawdziwego MJPEG,
zdjęć ani audio.

## API

Trasy lokalnego API HTTP, ich parametry, odpowiedzi i kody błędów opisuje
[docs/rest_endpoints_pl.md](docs/rest_endpoints_pl.md). Implementacja integracji
Video Service pozostaje źródłem prawdy dla jej protokołu.

## Bezpieczeństwo i ograniczenia

- provisioning AP jest otwarty, a HTTP API nie ma uwierzytelniania ani TLS;
- urządzenie powinno pracować wyłącznie w zaufanej sieci lokalnej, bez
  przekierowania portu 80 do Internetu;
- hasło Wi-Fi jest przechowywane lokalnie w `config.json`, ale endpoint
  `get_config` zawsze zwraca puste `wifiPass`, a logi nie wypisują hasła;
- obsługiwany jest jeden aktywny stream kamery; próba równoległego użycia kamery
  może zwrócić HTTP `409`;
- bieżący układ partycji nie zapewnia aplikacyjnego mechanizmu OTA — firmware i
  LittleFS wgrywa się przez PlatformIO/USB;
- wyniki zadań Video Service wymagają karty SD; bez niej firmware raportuje błąd
  zadania i nie próbuje przechowywać obrazu w RAM.

## Kontrola przed oddaniem zmian

```shell
cd web
npm run lint
npm run build

cd ../firmware
pio run
pio run --target buildfs
```

Po zmianach dotyczących sprzętu wykonaj test na urządzeniu: pierwszy boot/AP,
zapis konfiguracji, restart do STA, wszystkie rozdzielczości streamu, capture,
powrót power-save po zamknięciu streamu oraz ewentualnie mikrofon i kartę SD.
