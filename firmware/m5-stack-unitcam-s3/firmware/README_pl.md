# M5_Stack_UnitCam_S3

[English](README.md) | Polski

Firmware dla M5Stack UnitCamS3 (ESP32-S3), budowany w PlatformIO. Odpowiada za
obsługę kamery i mikrofonu, konfigurację połączenia Wi-Fi, lokalne API HTTP,
integrację z zewnętrzną usługą wideo oraz udostępnienie dashboardu zapisanego
w LittleFS.

## Zakres funkcjonalny

### Integracja z Video Service

Firmware przyjmuje zadania z usługi wideo działającej w tej samej sieci:

- przechwytywanie pojedynczych i cyklicznych zdjęć;
- statyczny i dynamiczny podgląd MJPEG;
- czasowe i ręcznie zatrzymywane nagrania MJPEG;
- nagrania audio WAV;
- trwałe buforowanie plików na karcie SD i ponawianie wysyłki HTTP;
- publikowanie heartbeat oraz stanu urządzenia i zadań przez MQTT;
- priorytet operacji usługi wideo nad lokalnym dashboardem.

Pliki zapisane na SD są usuwane dopiero po potwierdzonej wysyłce. Szczegóły
protokołu najlepiej odczytywać bezpośrednio z implementacji w
`src/services/video_service/`.

### API urządzenia

Serwer HTTP umożliwia sterowanie kamerą, pobieranie obrazu i statusu, obsługę
mikrofonu, karty SD, LED oraz konfiguracji sieciowej. Dokładny wykaz tras,
parametrów i odpowiedzi znajduje się w
[`../docs/rest_endpoints_pl.md`](../docs/rest_endpoints_pl.md).

### Lokalny dashboard

Firmware serwuje z LittleFS skompresowaną aplikację webową. Dashboard obsługuje:

- pierwszą konfigurację urządzenia w trybie punktu dostępowego;
- podgląd i kontrolę kamery po połączeniu urządzenia z siecią;
- stały lub automatycznie dostosowywany stream;
- pojedyncze zdjęcia oraz podgląd temperatury, FPS i stanu kamery;
- zmianę konfiguracji sieciowej urządzenia.

Jeżeli konfiguracja jest niepełna albo połączenie STA nie powiedzie się w ciągu
30 sekund, urządzenie uruchamia otwarty AP `UnitCamS3-XXXX` pod adresem
`http://192.168.1.1`.

## Najważniejsze technologie

- C++ i framework Arduino dla ESP32-S3;
- PlatformIO z platformą `espressif32@6.4.0`;
- sterownik `esp_camera` oraz PSRAM do obsługi obrazu;
- AsyncTCP `1.1.1` i ESPAsyncWebServer `1.2.3` dołączone w `lib/`;
- ArduinoJson `6.21.6` i PubSubClient `2.8.0`, przypięte w `platformio.ini`;
- LittleFS dla konfiguracji i aplikacji webowej;
- karta SD dla materiałów oczekujących na wysłanie;
- FreeRTOS dla zadań operacji, uploadu i telemetrii;
- Mooncake ze spdlog `1.12.0`, dołączone w kodzie źródłowym.

## Środowisko sprzętowe

Konfiguracja `m5stack-unitcams3` używa płytki PlatformIO `esp32s3box`, zgodnej
z modułem UnitCamS3:

- CPU 240 MHz;
- flash 16 MB, 80 MHz, QIO;
- octal PSRAM;
- niestandardowy układ partycji z `custom.csv`;
- LittleFS jako system plików;
- port szeregowy 115200 baud.

## Konfiguracja początkowa

Konfiguracja robocza jest przechowywana w `/config.json` w LittleFS. Pliki
`firmware/data/*.json` są ignorowane przez Git, ponieważ mogą zawierać SSID,
hasła i adresy prywatnej infrastruktury.

Zalecany proces pierwszego uruchomienia:

1. Zbuduj dashboard i wgraj LittleFS zgodnie z dalszą częścią instrukcji.
2. Wgraj firmware i uruchom urządzenie.
3. Połącz się z otwartą siecią `UnitCamS3-XXXX`.
4. Otwórz `http://192.168.1.1` i uzupełnij formularz.
5. Po restarcie przejdź do docelowej sieci i otwórz skonfigurowany adres kamery.

Urządzenie obsługuje Wi-Fi 2,4 GHz i używa statycznego IPv4. Konfiguracja
obejmuje:

- SSID i hasło Wi-Fi;
- adres kamery, bramę, maskę podsieci i DNS;
- adres oraz port Video Service;
- port brokera MQTT;
- interwał heartbeat od 5 do 3600 sekund.

Domyślne wartości to `255.255.255.0` dla maski, `3000` dla portu Video Service,
`1883` dla MQTT oraz `15` sekund dla heartbeat. Przy migracji starszej
konfiguracji brakująca brama jest wyliczana jako adres `.1` w podsieci kamery,
a DNS przyjmuje adres bramy.

Opcjonalnie można przed buildem utworzyć lokalny `data/config.json`. Taki plik
nie powinien być zatwierdzany w repozytorium:

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

Jeżeli LittleFS nie zawiera konfiguracji sieciowej, firmware może jednorazowo
zaimportować zgodne pola z `/config.json` na karcie SD. Konfiguracja zapisana
z dashboardu ma pierwszeństwo.

## Wymagania

- M5Stack UnitCamS3;
- Python 3 i PlatformIO Core;
- przewód USB z transmisją danych;
- Node.js 18+ i npm, jeżeli dashboard ma być budowany ze źródeł.

Sprawdzenie narzędzi:

```shell
pio --version
node --version
npm --version
```

## Kompilacja firmware

Z katalogu `firmware/`:

```shell
pio run
```

PlatformIO pobierze dokładnie wersje zadeklarowane w `platformio.ini`.
Artefakty, w tym `firmware.bin` i `firmware.elf`, powstaną w
`.pio/build/m5stack-unitcams3/`.

Sam obraz LittleFS można zbudować poleceniem:

```shell
pio run --target buildfs
```

## Przygotowanie dashboardu w LittleFS

Dashboard powstaje w katalogu `web/`:

```shell
cd ../web
npm ci
npm run build
```

Build generuje `web/dist/index.html.gz`. Skopiuj go do lokalnego katalogu danych
firmware.

PowerShell:

```powershell
Copy-Item .\dist\index.html.gz ..\firmware\data\index.html.gz -Force
```

Linux/macOS:

```shell
cp dist/index.html.gz ../firmware/data/index.html.gz
```

Plik `firmware/data/index.html.gz` jest celowo ignorowany przez Git. Każdy
użytkownik publicznego repozytorium powinien zbudować go lokalnie przed
`buildfs` lub `uploadfs`.

## Wgrywanie na urządzenie

Lista portów:

```shell
pio device list
```

Firmware:

```shell
pio run --target upload --upload-port COM5
```

Zawartość LittleFS:

```shell
pio run --target uploadfs --upload-port COM5
```

Na Linux/macOS zastąp `COM5` właściwym portem, na przykład `/dev/ttyACM0`.
Firmware i LittleFS są niezależnymi obrazami: zmiana C++ wymaga `upload`, a
zmiana dashboardu lub lokalnego pliku konfiguracyjnego wymaga `uploadfs`.

Monitor portu szeregowego:

```shell
pio device monitor --port COM5 --baud 115200
```

## Bezpieczeństwo uruchomienia

Serwer działa po HTTP i nie ma uwierzytelniania. Punkt dostępowy używany do
pierwszej konfiguracji także jest otwarty. Urządzenie należy konfigurować w
kontrolowanym miejscu, używać wyłącznie w zaufanej sieci lokalnej i nie
udostępniać portu 80 do Internetu.
