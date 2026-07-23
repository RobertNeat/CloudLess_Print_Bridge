# Endpointy HTTP/REST firmware UnitCamS3

[English](rest_endpoints.md) | Polski

Dokument opisuje trasy faktycznie rejestrowane przez firmware oraz payloady
wynikające z bieżącej implementacji. Dashboard i API działają na tym samym
serwerze HTTP, na porcie `80`.

## Adres bazowy i zasady ogólne

- Tryb provisioning AP: `http://192.168.1.1` (SSID `UnitCamS3-XXXX`).
- Tryb station: `http://{unitCamIp}`, np. `http://192.168.1.231`.
- Firmware nie używa HTTPS ani uwierzytelniania użytkownika.
- Trasy integracyjne `POST /api/v1/video-service/*` są chronione wyłącznie przez
  sprawdzenie, czy źródłowy adres IPv4 jest równy skonfigurowanemu
  `videoServiceIp`.
- Payloady POST JSON wymagają `Content-Type: application/json`.
- Formularz dashboardu wymaga
  `Content-Type: application/x-www-form-urlencoded`.
- Parametr `t` dodawany przez dashboard jest wyłącznie cache-busterem i firmware
  go ignoruje.
- Kamera obsługuje tylko jednego właściciela/stream naraz. Zadania Video Service
  mają pierwszeństwo i mogą zamknąć stream dashboardu.

Obsługiwane wartości rozdzielczości:

| `framesize` | Nazwa | Wymiary |
|---:|---|---:|
| `5` | QVGA | 320 x 240 |
| `8` | VGA | 640 x 480 |
| `9` | SVGA | 800 x 600 |
| `10` | XGA | 1024 x 768 |
| `13` | UXGA | 1600 x 1200 |

## 1. URL-e aplikacji webowej

| Metoda | URL | Odpowiedź |
|---|---|---|
| GET | `/` | Dashboard z `/index.html.gz`, `text/html`, nagłówek `Content-Encoding: gzip` |
| GET | `/index.html` | Ten sam dashboard |
| GET | `/camera_icon.png` | Statyczna ikona z LittleFS |
| GET | dowolna nieznana ścieżka | `302` do `/` (fallback React/captive portal) |

Serwer ma również ogólne mapowanie `serveStatic("/", LittleFS, "/")`, dlatego
każdy plik znajdujący się w głównym katalogu LittleFS może stać się publicznym
URL-em.

> **Ryzyko bezpieczeństwa:** bieżąca konfiguracja serwera pozwala na
> `GET /config.json`. Jest to ten sam plik, w którym firmware przechowuje m.in.
> `wifiPass`. Endpoint `/api/v1/get_config` poprawnie zwraca puste hasło, ale
> statyczne mapowanie może ominąć to zabezpieczenie. Należy zablokować tę ścieżkę
> albo ograniczyć statyczny handler wyłącznie do publicznych assetów.

## 2. Endpointy używane bezpośrednio przez dashboard

Dashboard korzysta z poniższych sześciu tras. Są one jednocześnie dostępne dla
innych klientów HTTP bez uwierzytelniania.

### `GET /api/v1/get_config`

Pobiera konfigurację potrzebną do wyrenderowania trybu provisioning albo panelu
kamery. Brak payloadu żądania.

Odpowiedź `200 application/json`:

```json
{
  "wifiSsid": "nazwa-sieci",
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

`mode` ma wartość `ap` albo `station`. `wifiPass` zawsze jest pustym stringiem.

### `POST /api/v1/set_config_form`

Natywny formularz HTML używany przez dashboard.

```http
Content-Type: application/x-www-form-urlencoded

wifiSsid=MyWiFi&wifiPass=secret&unitCamIp=192.168.1.231&gatewayIp=192.168.1.1&subnetMask=255.255.255.0&dnsIp=192.168.1.1&videoServiceIp=192.168.1.100&videoServicePort=3000&mqttPort=1883&heartbeatIntervalSeconds=15
```

Pola wymagane przez handler: `wifiSsid`, `wifiPass`, `unitCamIp`,
`videoServiceIp`. Dashboard wysyła dodatkowo wszystkie pozostałe pola z
przykładu. Odpowiedź sukcesu to `200 text/html` ze stroną potwierdzenia; po około
3 sekundach urządzenie restartuje się. Błędy walidacji zwracają `400 text/plain`,
a błąd zapisu `500 text/plain`.

Zasady zapisu hasła:

- puste `wifiPass` przy niezmienionym SSID zachowuje obecne hasło;
- puste `wifiPass` przy zmianie SSID zapisuje puste hasło.

### `GET /api/v1/camera/runtime?t={timestamp}`

Dashboard odpytuje trasę co 3 sekundy.

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

`temperature` może być `null`. `framesize` jest wartością liczbową z tabeli
rozdzielczości. Odpowiedź: `200 application/json`.

### `GET /api/v1/stream?framesize={5|8|9|10|13}`

Stały stream MJPEG wykorzystywany w podglądzie dashboardu.

- request payload: brak; opcjonalny query parameter `framesize`;
- sukces: `200 multipart/x-mixed-replace; boundary=123456789000000000000987654321`;
- każda część ma `Content-Type: image/jpeg` oraz `Content-Length`;
- `400 {"msg":"unsupported framesize"}` dla nieobsługiwanej wartości;
- `409 {"msg":"camera is already streaming"}` gdy kamera jest zajęta;
- `503 {"msg":"camera unavailable"}` gdy nie można uruchomić kamery.

Bez parametru stream używa aktualnego ustawienia sensora. Maksymalna szybkość
streamu to 25 FPS.

### `GET /api/v1/stream/dynamic`

Dynamiczny stream MJPEG. Startuje od UXGA i automatycznie dobiera rozdzielczość
na podstawie temperatury/stanu przechwytywania. Format sukcesu jest taki sam jak
dla stałego streamu. Typowe błędy: `409`, `503`, `501`.

### `GET /api/v1/capture/uxga`

Pojedynczy, zweryfikowany obraz JPEG 1600 x 1200.

- request payload: brak;
- opcjonalne query parametry ustawień: `brightness=-2..2`, `contrast=-2..2`,
  `compressionLevel=4..63`, `rotation=0|180`;
- niższy `compressionLevel` oznacza słabszą kompresję JPEG i większy plik;
- sukces: `200 image/jpeg`;
- `400 {"error":"invalid_capture_settings"}` dla błędnych ustawień;
- `409` gdy kamera jest zajęta;
- `503` gdy przechwycenie się nie uda; firmware może zaplanować restart kamery.

## 3. Bezpośrednie API firmware

### 3.1 Kamera

#### `GET /api/v1/capture`

Pojedynczy JPEG w aktualnej lub wskazanej rozdzielczości.

```http
GET /api/v1/capture?framesize=8&brightness=0&contrast=0&compressionLevel=12&rotation=0
```

Parametry ustawień i kody błędów są takie jak dla `/capture/uxga`.
`framesize` jest opcjonalny, ale jeśli występuje, musi mieć jedną z pięciu
obsługiwanych wartości.

#### `GET /api/v1/stream/dynamic/status`

Stan algorytmu dynamicznego streamu:

```json
{
  "temperature": 52.1,
  "framesize": 10
}
```

`temperature` może być `null`. Odpowiedź: `200 application/json`.

#### `GET /api/v1/status`

Pełny status sensora. Sukces: `200 application/json`.

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

Możliwe błędy: `503` przy zajętej/niedostępnej kamerze i `501` przy braku
sensora.

#### `GET /api/v1/control?var={nazwa}&val={liczba}`

Zmienia jedną właściwość sensora. Body żądania nie występuje. Obsługiwane nazwy:

`framesize`, `compressionLevel`, `contrast`, `brightness`, `saturation`, `sharpness`,
`gainceiling`, `colorbar`, `awb`, `agc`, `aec`, `hmirror`, `vflip`, `awb_gain`,
`agc_gain`, `aec_value`, `aec2`, `denoise`, `dcw`, `bpc`, `wpc`, `raw_gma`,
`lenc`, `special_effect`, `wb_mode`, `ae_level`.

Sukces zwraca pustą odpowiedź `200`. Brak parametrów lub nieznana nazwa daje
`404`. Zmiana `framesize` podczas streamu daje `409`, a nieobsługiwana
rozdzielczość `400`. Dla ustawień innych niż `framesize` handler przekazuje
wartość do sterownika sensora, ale mimo błędu zwróconego przez sterownik nadal
odpowiada `200`.

Trasy `/capture*`, `/stream*`, `/status` i `/control` dodają CORS
`Access-Control-Allow-Origin: *`. Pozostałe grupy API nie ustawiają CORS.

### 3.2 Konfiguracja i diagnostyka systemu

#### `POST /api/v1/set_config`

JSON-owy odpowiednik formularza dashboardu:

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

Wymagane klucze: `wifiSsid`, `wifiPass`, `unitCamIp`, `videoServiceIp`.
Pozostałe są opcjonalne; brak/pusta wartość adresu zachowuje dotychczasową
wartość, a port/interwał `0` także zachowuje dotychczasową wartość.

Walidacja obejmuje: SSID 1..32 znaków, hasło do 64 znaków, poprawne niezerowe
IPv4 oraz `heartbeatIntervalSeconds` 5..3600. Sukces:

```json
{"msg":"ok","restarting":true}
```

Urządzenie restartuje się po około 3 sekundach. Błędy: `400` z
`missing config fields` albo `bad config`, `500` z `config persistence failed`.

#### Pozostałe trasy systemowe

| Metoda i URL | Payload | Sukces | Błędy/uwagi |
|---|---|---|---|
| `GET /api/v1/get_mac` | brak | `200 {"msg":"ok","mac":"AA:BB:CC:DD:EE:FF"}` | — |
| `GET /api/v1/get_wifi_list` | brak | `200 {"wifiList":["SSID-1","SSID-2"]}` | maks. 20 pozycji; skan jest synchroniczny |
| `GET /api/v1/reset_config` | brak | `200 {"msg":"ok"}` | zapisuje defaults; **nie restartuje**; `500` przy błędzie zapisu |
| `GET /api/v1/led_on` | brak | `200 {"msg":"ok"}` | włącza LED i publikuje event MQTT |
| `GET /api/v1/led_off` | brak | `200 {"msg":"ok"}` | wyłącza LED i publikuje event MQTT |
| `GET /api/v1/check_sdcard` | brak | `200 {"info":"Type: SDHC  Size: 32G"}` | brak/niepoprawna karta również daje `200` z `SD Card Not Valid`; `409 {"error":"sd_card_busy"}` podczas zadania Video Service |
| `GET /api/v1/sdcard/files?path=/&offset=0&limit=100&depth=2` | brak | rekurencyjna lista plików i katalogów | `400`, `404`, `409`, `500` albo `503`; `limit` 1..250, `depth` 0..8 |
| `GET /api/v1/sdcard/usage` | brak | zajętość karty w bajtach i procentach | `409` podczas zadania Video Service; `503` przy niedostępnej karcie |

Listing przechodzi rekurencyjnie od katalogu wskazanego przez `path`. Wartość
`depth=0` zwraca tylko jego bezpośrednią zawartość, `depth=1` schodzi o jeden
poziom katalogów, a maksymalna wartość wynosi `8`. Paginacja `offset` i `limit`
jest stosowana globalnie do kolejności przejścia w głąb:

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

Gdy `hasMore` ma wartość `true`, odpowiedź zawiera `nextOffset`. Każdy wpis ma
`depth` liczony względem zawartości katalogu startowego oraz `parentPath`, więc
struktura pozostaje jednoznaczna między stronami. Ścieżki muszą być bezwzględne
i nie mogą zawierać `..` ani ukośników odwrotnych.

Statystyki zajętości mają postać:

```json
{
  "usedBytes": 1073741824,
  "totalBytes": 31914983424,
  "freeBytes": 30841241600,
  "usagePercent": 3.364
}
```

### 3.3 Mikrofon

#### `GET /api/v1/mic_start?seconds={1..20}`

Uruchamia asynchroniczny zapis WAV do `/wav/rec.wav` w LittleFS. `seconds` jest
opcjonalne, domyślnie `4`.

- `202 {"status":"accepted"}` — nagrywanie uruchomione;
- `400 {"error":"seconds_must_be_1_to_20"}`;
- `409 {"error":"microphone_busy"}`;
- `503 {"error":"recording_task_unavailable"}`.

#### `GET /api/v1/mic_is_recording`

Zwraca `200 {"recording":true}` albo `200 {"recording":false}`.

## 4. API poleceń z Video Service do firmware

Wszystkie poniższe POST-y są asynchroniczne. Sukces oznacza przyjęcie zadania,
nie jego ukończenie:

```json
{"status":"accepted","requestId":"req-001"}
```

Wspólne reguły:

- `requestId`: 1..64 znaków; litery/cyfry oraz `.`, `_`, `-`; wartości `.` i
  `..` są zabronione;
- `resolution`: `QVGA`, `VGA`, `SVGA`, `XGA` albo `UXGA`;
- maksymalny czas zwykłej operacji: 3 600 000 ms (1 h);
- maksymalny live: 600 000 ms (10 min);
- żądanie z IP innym niż `videoServiceIp`: `403 {"error":"video_service_only"}`;
- niepoprawny payload: `400`; zajęta kamera/urządzenie: `409`.

### `POST /api/v1/video-service/captures`

```json
{
  "requestId": "capture-001",
  "resolution": "UXGA"
}
```

Wykonuje pojedynczy JPEG, zapisuje go na SD i umieszcza w trwałej kolejce uploadu.

### `POST /api/v1/video-service/captures/periodic`

```json
{
  "requestId": "periodic-001",
  "resolution": "VGA",
  "intervalMs": 1000,
  "durationMs": 60000
}
```

`intervalMs` musi być co najmniej `250`; `durationMs` musi należeć do
`1..3600000`. Zbyt krótki interwał daje `400 {"error":"interval_too_short"}`.

### `POST /api/v1/video-service/recordings/timed`

```json
{
  "requestId": "recording-001",
  "resolution": "VGA",
  "durationMs": 30000
}
```

`durationMs`: `1..3600000`. Nagranie MJPEG jest segmentowane na części do około
8 MiB i zapisywane na SD przed uploadem.

### `POST /api/v1/video-service/recordings/start`

```json
{
  "requestId": "manual-001",
  "resolution": "SVGA",
  "maxDurationMs": 3600000
}
```

`maxDurationMs` jest opcjonalne (domyślnie 1 h), ale jeśli występuje, musi być
większe od zera i nie większe niż 1 h.

### `POST /api/v1/video-service/recordings/stop`

```json
{"requestId":"manual-001"}
```

`requestId` jest opcjonalny; `{}` zatrzymuje aktualne nagranie manualne.
Sukces: `202 {"status":"stopping"}`. Gdy nie ma pasującego zadania:
`404 {"error":"operation_not_found"}`.

### `POST /api/v1/video-service/live/start`

```json
{
  "requestId": "live-001",
  "resolution": "VGA",
  "maxDurationMs": 600000
}
```

`maxDurationMs` jest opcjonalne (domyślnie 10 min). Wartość większa niż 10 min
jest obcinana do 10 min; zero jest błędem. Firmware inicjuje połączenie MJPEG do
ingestu Video Service.

### `POST /api/v1/video-service/live/dynamic/start`

```json
{
  "requestId": "dynamic-live-001",
  "maxDurationMs": 600000
}
```

`resolution` jest opcjonalne i domyślnie przyjmuje `UXGA`. Pozostałe reguły są
takie jak dla `/live/start`.

### `POST /api/v1/video-service/live/stop`

```json
{"requestId":"live-001"}
```

`requestId` jest opcjonalny. Sukces: `202 {"status":"stopping"}`; brak
pasującego live: `404 {"error":"operation_not_found"}`.

### `POST /api/v1/video-service/audio`

```json
{
  "requestId": "audio-001",
  "durationSeconds": 8
}
```

`durationSeconds` musi być całkowite i należeć do `1..20`. Błędy:
`400 {"error":"invalid_request"}`,
`400 {"error":"invalid_audio_request"}` albo
`409 {"error":"device_busy"}`.

### `GET /api/v1/video-service/status`

Ten endpoint, w odróżnieniu od poleceń POST, **nie sprawdza źródłowego IP**.

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

Możliwe wartości `operation`: `idle`, `singleCapture`, `periodicCapture`,
`timedRecording`, `manualRecording`, `audioRecording`, `liveStream`.

## 5. Podsumowanie tras

Firmware rejestruje 29 unikalnych tras `/api/v1/*`:

- 8 tras kamery;
- 9 tras systemu/konfiguracji;
- 2 trasy mikrofonu;
- 10 tras integracji Video Service.

Dashboard aktywnie używa 6 z tych tras:
`get_config`, `set_config_form`, `camera/runtime`, `stream`, `stream/dynamic` oraz
`capture/uxga`. Pozostałe są dostępem programistycznym/diagnostycznym albo
interfejsem integracji z Video Service.
