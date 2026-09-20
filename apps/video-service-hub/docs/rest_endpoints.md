# REST API — Video Service Hub

Dokument opisuje pełny, aktualny kontrakt HTTP aplikacji
`@cloudless/video-service-hub` znajdującej się w monorepo
`CloudLess_Print_Bridge`.

Serwis pośredniczy w wysyłaniu komend do firmware kamer UnitCam S3, odbiera
materiały JPEG/MJPEG/WAV, domyślnie zapisuje transmisje live (chyba że
komenda `start-live`/`start-dynamic-live` jawnie ustawi `persist: false` —
patrz niżej) i udostępnia stan kamer obserwowany przez MQTT.

## Adres bazowy

```text
http://<host>:<port>
```

Domyślnie aplikacja nasłuchuje na:

```text
http://0.0.0.0:10322
```

Adres nasłuchu zmienia `VIDEO_SERVICE_HUB_HOST`, a port
`VIDEO_SERVICE_HUB_PORT`. Aplikacja nie ustawia globalnego
prefiksu ani automatycznego wersjonowania. Trasy domenowe same zawierają prefiks
`/api/v1`.

Przykładowy adres lokalny klienta:

```text
http://localhost:10322
```

W konfiguracji firmware `videoServiceIp` musi wskazywać adres LAN komputera
uruchamiającego serwis. Kamera nie może używać `0.0.0.0` ani `127.0.0.1`.

## Zestawienie endpointów

Implementacja udostępnia 9 wzorców tras REST:

| Metoda | Ścieżka                                                                | Zastosowanie                        |
| ------ | ---------------------------------------------------------------------- | ----------------------------------- |
| `POST` | `/api/v1/cameras/{cameraId}/commands/{command}`                        | Przekazanie komendy do firmware     |
| `POST` | `/api/v1/cameras/{cameraId}/captures`                                  | Odbiór obrazu JPEG                  |
| `POST` | `/api/v1/cameras/{cameraId}/recordings/{requestId}/parts/{partNumber}` | Odbiór części nagrania MJPEG        |
| `POST` | `/api/v1/cameras/{cameraId}/audio`                                     | Odbiór nagrania WAV                 |
| `POST` | `/api/v1/cameras/{cameraId}/live`                                      | Odbiór i zapis transmisji MJPEG     |
| `GET`  | `/api/v1/cameras/{cameraId}/live`                                      | Oglądanie aktywnej transmisji MJPEG |
| `GET`  | `/api/v1/cameras`                                                      | Lista kamer wykrytych przez MQTT    |
| `GET`  | `/api/v1/cameras/{cameraId}/telemetry`                                 | Ostatnia telemetria wybranej kamery |
| `GET`  | `/health`                                                              | Stan storage i runtime MQTT         |

Serwis nie udostępnia produkcyjnie tras `/test/*`.

## Wspólne wartości

### `cameraId` i `requestId`

Identyfikatory:

- mają od 1 do 64 znaków;
- mogą zawierać litery, cyfry, `.`, `_` i `-`;
- nie mogą mieć wartości `.` ani `..`.

Niepoprawny identyfikator zwraca `400 Bad Request`.

### Rozdzielczość

Akceptowane wartości:

```text
QVGA
VGA
SVGA
XGA
UXGA
```

Wartości są rozróżniane wielkością liter.

### Typy mediów

Serwis porównuje pełny podstawowy typ mediów, a nie tylko jego początek.
Parametry po średniku są dozwolone, np.:

```text
image/jpeg; charset=binary
multipart/x-mixed-replace; boundary=unitcams3-frame
```

Wartość taka jak `image/jpeg-invalid` jest odrzucana.

## Komendy wysyłane do kamery

### `POST /api/v1/cameras/{cameraId}/commands/{command}`

Serwis waliduje żądanie, usuwa z body pole `cameraBaseUrl`, a pozostały JSON
przekazuje metodą `POST` do odpowiedniego endpointu firmware.

Nagłówek:

```http
Content-Type: application/json
```

Body musi być obiektem JSON i zawierać `cameraBaseUrl`:

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "recording-001",
  "resolution": "VGA",
  "durationMs": 30000
}
```

`cameraBaseUrl` musi być originem HTTP:

- protokół wyłącznie `http`;
- bez loginu i hasła;
- bez ścieżki innej niż `/`;
- bez query string i fragmentu.

Pole służy wyłącznie do wybrania urządzenia i nie jest wysyłane do firmware.
Serwis jest przeznaczony do zaufanej sieci LAN. Przed publicznym wystawieniem
tej trasy należy dodać autoryzację i rejestr dozwolonych kamer.

Domyślny timeout połączenia z kamerą wynosi 10 sekund i może być zmieniony przez
`VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS`.

### Mapowanie komend

| `{command}`          | Endpoint firmware                          |
| -------------------- | ------------------------------------------ |
| `capture`            | `/api/v1/video-service/captures`           |
| `periodic-capture`   | `/api/v1/video-service/captures/periodic`  |
| `timed-recording`    | `/api/v1/video-service/recordings/timed`   |
| `start-recording`    | `/api/v1/video-service/recordings/start`   |
| `stop-recording`     | `/api/v1/video-service/recordings/stop`    |
| `start-live`         | `/api/v1/video-service/live/start`         |
| `start-dynamic-live` | `/api/v1/video-service/live/dynamic/start` |
| `stop-live`          | `/api/v1/video-service/live/stop`          |
| `record-audio`       | `/api/v1/video-service/audio`              |

### Walidacja payloadów komend

#### `capture`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "capture-001",
  "resolution": "UXGA"
}
```

Wymaga poprawnych `requestId` i `resolution`.

#### `periodic-capture`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "periodic-001",
  "resolution": "VGA",
  "intervalMs": 1000,
  "durationMs": 60000
}
```

- `intervalMs`: liczba całkowita od `250` do `3600000`;
- `durationMs`: liczba całkowita od `1` do `3600000`.

#### `timed-recording`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "recording-001",
  "resolution": "VGA",
  "durationMs": 30000
}
```

`durationMs` musi być liczbą całkowitą od `1` do `3600000`.

#### `start-recording`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "manual-001",
  "resolution": "SVGA",
  "maxDurationMs": 3600000
}
```

`maxDurationMs` jest opcjonalne. Jeśli występuje, musi być liczbą całkowitą
od `1` do `3600000`.

#### `stop-recording`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "manual-001"
}
```

`requestId` jest opcjonalne. Po jego pominięciu serwis przekazuje do firmware
pusty obiekt.

#### `start-live`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "live-001",
  "resolution": "VGA",
  "maxDurationMs": 600000,
  "persist": true
}
```

Wymaga `requestId` i `resolution`. Opcjonalne `maxDurationMs` musi być liczbą
całkowitą od `1` do `86400000` (24h). Pole celowo nie ma sensownej wartości
domyślnej po stronie huba (poza górnym ograniczeniem) — hub nie utrzymuje
własnego licznika czasu transmisji, więc to kamera musi sama zakończyć
przesyłanie po tym czasie; każdy wywołujący powinien zawsze przekazywać
jawną wartość, dopasowaną do przewidywanego czasu oglądania (np. krótki
podgląd vs. podgląd trwający cały wydruk), żeby porzucona sesja (zerwane
połączenie, zamknięta karta) zawsze kiedyś sama się zakończy.
Opcjonalne `persist` (domyślnie `true`) jest polem wyłącznie po stronie
huba — nigdy nie trafia do firmware kamery — i steruje tym, czy
`POST /api/v1/cameras/{cameraId}/live` (patrz niżej) zapisze ukończoną
transmisję jako pozycję biblioteki mediów rodzaju `live`. Ustawienie
`persist: false` daje podgląd wyłącznie na żywo, bez pozostawiania nagrania
na dysku.

#### `start-dynamic-live`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "dynamic-live-001",
  "maxDurationMs": 600000,
  "persist": true
}
```

Wymaga `requestId`. Pola `resolution` i `maxDurationMs` są opcjonalne.
Jeśli występują, `resolution` musi być obsługiwaną wartością, a
`maxDurationMs` liczbą całkowitą od `1` do `86400000` (24h; patrz uwaga w
`start-live` wyżej). Opcjonalne `persist` działa identycznie jak w
`start-live` (patrz wyżej).

#### `stop-live`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "live-001"
}
```

`requestId` jest opcjonalne.

#### `record-audio`

```json
{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "audio-001",
  "durationSeconds": 8
}
```

`durationSeconds` musi być liczbą całkowitą od `1` do `20`.

### Odpowiedź proxy

Status HTTP, `Content-Type` i body odpowiedzi firmware są przekazywane
klientowi. JSON jest zwracany jako JSON. Nieprawidłowy JSON zadeklarowany przez
firmware pozostaje widoczny jako tekst.

Typowe błędy generowane przez Video Service Hub:

| Status            | Przyczyna                                                    |
| ----------------- | ------------------------------------------------------------ |
| `400 Bad Request` | Niepoprawny body, identyfikator, komenda, URL lub parametry  |
| `502 Bad Gateway` | Timeout, brak połączenia albo inny błąd komunikacji z kamerą |

Pozostałe statusy mogą pochodzić bezpośrednio z firmware, np. `202`, `400`,
`403`, `404` albo `409`.

## Odbieranie materiałów z kamery

Endpointy ingestu przyjmują surowe body binarne lub strumień, a nie JSON.
Upload jest najpierw zapisywany w `storage/.tmp`, mierzony i hashowany SHA-256.
Dopiero kompletna, zwalidowana zawartość jest publikowana pod nazwą docelową.
Nieukończone pliki tymczasowe są usuwane.

Limity rozmiaru można zmieniać zmiennymi środowiskowymi.

### `POST /api/v1/cameras/{cameraId}/captures`

Odbiera kompletny plik JPEG.

Wymagane nagłówki:

| Nagłówek       | Wartość                              |
| -------------- | ------------------------------------ |
| `Content-Type` | `image/jpeg`                         |
| `X-Request-Id` | Identyfikator żądania lub serii      |
| `X-Resolution` | Jedna z obsługiwanych rozdzielczości |

Opcjonalny nagłówek:

| Nagłówek             | Wartość                    |
| -------------------- | -------------------------- |
| `X-Capture-Sequence` | Nieujemna liczba całkowita |

Przykład:

```http
POST /api/v1/cameras/a1b2c3/captures
Content-Type: image/jpeg
X-Request-Id: capture-001
X-Resolution: UXGA
X-Capture-Sequence: 0

<dane JPEG>
```

Serwis sprawdza znaczniki początku `FF D8` i końca `FF D9`. Domyślny limit
wynosi 20 MiB (`VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES`).

Sukces: `201 Created`.

```json
{
  "stored": true,
  "duplicate": false,
  "cameraId": "a1b2c3",
  "requestId": "capture-001",
  "resolution": "UXGA",
  "sequence": 0,
  "size": 12345,
  "sha256": "<sha256>",
  "fileName": "000000.jpg"
}
```

Pliki:

```text
storage/captures/{cameraId}/{requestId}/{sequence}.jpg
storage/captures/{cameraId}/{requestId}/manifest.json
```

Jeżeli `X-Capture-Sequence` nie występuje, serwis nadaje kolejny numer,
zaczynając od `0`. Jest to zgodne z bieżącym firmware. Ponieważ aktualny
protokół urządzenia nie przesyła numeru pliku, bez tego nagłówka nie można
jednoznacznie odróżnić retry od kolejnego identycznego zdjęcia.

Z podanym `X-Capture-Sequence` identyczne ponowienie zwraca
`"duplicate": true`. Inna zawartość dla tej samej sekwencji zwraca
`409 Conflict`.

### `POST /api/v1/cameras/{cameraId}/recordings/{requestId}/parts/{partNumber}`

Odbiera jedną część nagrania MJPEG. Numeracja zaczyna się od `0`.

Wymagane nagłówki:

| Nagłówek                       | Wartość                                          |
| ------------------------------ | ------------------------------------------------ |
| `Content-Type`                 | `multipart/x-mixed-replace`, zwykle z `boundary` |
| `X-Total-Parts`                | Dodatnia całkowita liczba części                 |
| `X-Resolution`                 | Rozdzielczość nagrania                           |
| `X-Requested-Duration-Seconds` | Skończona liczba nieujemna                       |
| `X-Total-Frames`               | Nieujemna liczba całkowita                       |

Warunki:

- `partNumber` jest nieujemną liczbą całkowitą;
- `partNumber < X-Total-Parts`;
- body rozpoczyna się od `--`, jak multipart MJPEG;
- wszystkie części mają zgodne metadane.

Domyślny limit części wynosi 16 MiB (`VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES`).

Przykład:

```http
POST /api/v1/cameras/a1b2c3/recordings/recording-001/parts/0
Content-Type: multipart/x-mixed-replace; boundary=unitcams3-frame
X-Total-Parts: 3
X-Resolution: VGA
X-Requested-Duration-Seconds: 12.000
X-Total-Frames: 120

<część MJPEG>
```

Sukces: `201 Created`.

```json
{
  "stored": true,
  "duplicate": false,
  "cameraId": "a1b2c3",
  "requestId": "recording-001",
  "resolution": "VGA",
  "partNumber": 0,
  "totalParts": 3,
  "requestedDurationSeconds": 12,
  "totalFrames": 120,
  "size": 123456,
  "sha256": "<sha256>",
  "recordingComplete": false
}
```

Pliki:

```text
storage/recordings/{cameraId}/{requestId}/part-{partNumber}.mjpeg
storage/recordings/{cameraId}/{requestId}/manifest.json
```

Manifest zawiera wersję schematu, metadane nagrania, listę odebranych części,
SHA-256, rozmiary, czasy zapisu i flagę kompletności. Jest odczytywany ponownie
po restarcie aplikacji.

Identyczna ponowna część zwraca `"duplicate": true`. Inna treść pod tym samym
numerem albo metadane różniące się od manifestu zwracają `409 Conflict`.

### `POST /api/v1/cameras/{cameraId}/audio`

Odbiera kompletny plik WAV.

Wymagane nagłówki:

| Nagłówek             | Wartość                          |
| -------------------- | -------------------------------- |
| `Content-Type`       | `audio/wav`                      |
| `X-Request-Id`       | Identyfikator nagrania           |
| `X-Duration-Seconds` | Skończona liczba większa od zera |

Przykład:

```http
POST /api/v1/cameras/a1b2c3/audio
Content-Type: audio/wav
X-Request-Id: audio-001
X-Duration-Seconds: 8.000

<dane WAV>
```

Serwis sprawdza nagłówki `RIFF` oraz `WAVE`. Domyślny limit wynosi 10 MiB
(`VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES`).

Sukces: `201 Created`.

```json
{
  "stored": true,
  "duplicate": false,
  "cameraId": "a1b2c3",
  "requestId": "audio-001",
  "durationSeconds": 8,
  "size": 54321,
  "sha256": "<sha256>",
  "fileName": "audio-001.wav"
}
```

Plik:

```text
storage/audio/{cameraId}/{requestId}.wav
```

Identyczne ponowienie zwraca `"duplicate": true`, a inna zawartość dla tej
samej pary kamera–request zwraca `409 Conflict`.

### `POST /api/v1/cameras/{cameraId}/live`

Odbiera chunked MJPEG i równolegle przekazuje aktywnym odbiorcom endpointu
`GET`. Czy strumień trafia też na dysk, zależy od intencji `persist`
zapisanej przy dopasowanej komendzie `start-live`/`start-dynamic-live`
(patrz wyżej) dla tej samej pary `cameraId`/`requestId`:

- `persist` nieustawione lub `true` (domyślne, zgodne z dotychczasowym
  zachowaniem): transmisja jest zapisywana na dysk i po zakończeniu staje
  się pozycją biblioteki mediów rodzaju `live`.
- `persist: false`: żaden bajt nie trafia na dysk — transmisja jest
  wyłącznie przekazywana aktywnym odbiorcom `GET` i znika bez śladu po
  zakończeniu. Odpowiedź nadal zwraca `200 OK`, ale `"stored": false` i
  `"complete": false`.

Wymagane nagłówki:

| Nagłówek       | Wartość                                   |
| -------------- | ----------------------------------------- |
| `Content-Type` | `multipart/x-mixed-replace; boundary=...` |
| `X-Request-Id` | Identyfikator transmisji                  |
| `X-Resolution` | Rozdzielczość transmisji                  |

Parametr `boundary` jest obowiązkowy i może mieć maksymalnie 70 znaków.
Strumień musi zawierać co najmniej jedną granicę ramki. Domyślny limit całej
transmisji (liczony zawsze, niezależnie od `persist`) wynosi 1 GiB
(`VIDEO_SERVICE_HUB_LIVE_MAX_BYTES`).

Sukces po zakończeniu uploadu: `200 OK`.

```json
{
  "stored": true,
  "duplicate": false,
  "persist": true,
  "cameraId": "a1b2c3",
  "requestId": "live-001",
  "resolution": "VGA",
  "bytes": 1000000,
  "frames": 300,
  "complete": true
}
```

Plik (tylko gdy `persist` było `true`):

```text
storage/live/{cameraId}/{requestId}.mjpeg
```

Jednocześnie może istnieć tylko jedna aktywna transmisja dla tej samej pary
`cameraId` i `requestId`. Konflikt aktywnego klucza zwraca `409`.

Jeśli plik docelowy już istnieje:

- identyczna transmisja kończy się sukcesem z `"duplicate": true`;
- inna zawartość zwraca `409 Conflict`.

### `GET /api/v1/cameras/{cameraId}/live`

Udostępnia bieżący aktywny strumień MJPEG.

Opcjonalny query parameter:

```text
requestId=<identyfikator transmisji>
```

Przykład:

```http
GET /api/v1/cameras/a1b2c3/live?requestId=live-001
```

Bez `requestId` serwis wybiera aktywną transmisję wskazanej kamery. Odbiorca
zaczyna otrzymywać dane od najbliższej kompletnej granicy MJPEG, a nie od środka
ramki.

Odpowiedź:

```http
HTTP/1.1 200 OK
Content-Type: multipart/x-mixed-replace; boundary=unitcams3-frame
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
X-Request-Id: live-001
```

Gdy pasujący live nie jest aktywny, serwis zwraca `404 Not Found`.
Odbiorca, który nie nadąża i przekroczy bufor, jest odłączany. Domyślny limit
bufora wynosi 2 MiB (`VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES`).

## Kamery i telemetria MQTT

Video Service Hub obserwuje topic:

```text
cameras/+/+
```

Obsługiwane kanały:

```text
heartbeat
led
microphone
status
network
state
upload
```

Dla każdej pary kamera–kanał przechowywana jest tylko ostatnia wiadomość.
Payload jest parsowany jako JSON, a jeśli parsowanie się nie powiedzie,
pozostaje tekstem. Telemetria jest przechowywana w pamięci i nie przetrwa
restartu procesu.

### `GET /api/v1/cameras`

Zwraca kamery, które wysłały co najmniej jedną obsługiwaną wiadomość MQTT.

Sukces: `200 OK`.

```json
{
  "items": [
    {
      "cameraId": "a1b2c3",
      "firstSeenAt": "2026-07-23T12:00:00.000Z",
      "lastSeenAt": "2026-07-23T12:00:15.000Z",
      "lastHeartbeatAt": "2026-07-23T12:00:15.000Z",
      "lastChannel": "heartbeat",
      "messageCount": 4,
      "online": true
    }
  ],
  "count": 1
}
```

Kamera jest uznawana za online, jeśli od jej ostatniej dowolnej obsługiwanej
wiadomości nie minął `VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS`. Domyślnie
jest to 60 sekund.

Pusta lista jest poprawną odpowiedzią:

```json
{
  "items": [],
  "count": 0
}
```

### `GET /api/v1/cameras/{cameraId}/telemetry`

Zwraca ostatnią wiadomość każdego kanału wybranej kamery.

Sukces: `200 OK`.

```json
{
  "cameraId": "a1b2c3",
  "items": [
    {
      "cameraId": "a1b2c3",
      "channel": "heartbeat",
      "topic": "cameras/a1b2c3/heartbeat",
      "payload": {
        "status": "online",
        "fps": 0
      },
      "rawPayload": "{\"status\":\"online\",\"fps\":0}",
      "receivedAt": "2026-07-23T12:00:15.000Z",
      "retain": false,
      "qos": 0
    }
  ],
  "count": 1
}
```

Nieznana kamera nie powoduje `404`; serwis zwraca pustą listę z `count: 0`.

## Health check

### `GET /health`

Zwraca stan storage, aktywnych transmisji i runtime MQTT.

Endpoint zawsze odpowiada `200 OK`, o ile sam proces NestJS może obsłużyć
żądanie. Pole `status` ma wartość:

- `ok` — storage jest gotowy i obserwator MQTT jest połączony;
- `degraded` — co najmniej jeden z tych warunków nie jest spełniony.

Przykład:

```json
{
  "status": "ok",
  "storage": {
    "ready": true,
    "storageRoot": "P:\\CloudLess_Print_Bridge\\storage",
    "captureRequestCount": 2,
    "recordingCount": 1,
    "completedRecordingCount": 1,
    "activeLive": [
      {
        "cameraId": "a1b2c3",
        "requestId": "live-001",
        "resolution": "VGA",
        "startedAt": "2026-07-23T12:01:00.000Z",
        "bytes": 250000,
        "frames": 75,
        "viewers": 1
      }
    ],
    "recentlyCompletedLive": []
  },
  "mqtt": {
    "mode": "embedded",
    "observer": {
      "connected": true,
      "reconnecting": false,
      "clientId": "video-service-hub-observer-1234",
      "brokerUrl": "mqtt://127.0.0.1:1883/",
      "subscription": "cameras/+/+"
    },
    "broker": {
      "managedByApplication": true,
      "listening": true,
      "host": "0.0.0.0",
      "port": 1883
    },
    "cameraCount": 1,
    "telemetryCount": 4
  },
  "timestamp": "2026-07-23T12:01:15.000Z"
}
```

W trybie brokera zewnętrznego:

```json
{
  "mode": "external",
  "broker": {
    "managedByApplication": false
  }
}
```

Hasło i login brokera są usuwane z URL zwracanego w diagnostyce.

## Storage i limity

Domyślna struktura:

```text
storage/
├── captures/{cameraId}/{requestId}/{sequence}.jpg
├── captures/{cameraId}/{requestId}/manifest.json
├── recordings/{cameraId}/{requestId}/part-{partNumber}.mjpeg
├── recordings/{cameraId}/{requestId}/manifest.json
├── audio/{cameraId}/{requestId}.wav
├── live/{cameraId}/{requestId}.mjpeg
└── .tmp/
```

Katalog główny zmienia `VIDEO_SERVICE_HUB_STORAGE_PATH`. Przy starcie serwis:

1. tworzy brakujące katalogi;
2. usuwa pozostałości z `.tmp`;
3. odczytuje manifesty capture i nagrań;
4. oznacza storage jako gotowy.

| Zmienna                    |    Domyślnie | Znaczenie                      |
| -------------------------- | -----------: | ------------------------------ |
| `VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES`        |   `20971520` | Maksymalny JPEG, 20 MiB        |
| `VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES` |   `16777216` | Maksymalna część MJPEG, 16 MiB |
| `VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES`          |   `10485760` | Maksymalny WAV, 10 MiB         |
| `VIDEO_SERVICE_HUB_LIVE_MAX_BYTES`           | `1073741824` | Maksymalny zapis live, 1 GiB   |
| `VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES` |    `2097152` | Bufor odbiorcy live, 2 MiB     |

Przekroczenie limitu uploadu zwraca `413 Payload Too Large`.

## Obsługa błędów

Poza trasą proxy komend błędy mają standardowy format NestJS:

```json
{
  "message": "X-Request-Id header is required",
  "error": "Bad Request",
  "statusCode": 400
}
```

Najważniejsze kody:

| Status                      | Znaczenie                                                              |
| --------------------------- | ---------------------------------------------------------------------- |
| `200 OK`                    | Poprawny `GET` albo zakończony upload live                             |
| `201 Created`               | Poprawny capture, część nagrania lub audio                             |
| `400 Bad Request`           | Błędny identyfikator, nagłówek, typ mediów, parametry lub format pliku |
| `404 Not Found`             | Brak pasującego aktywnego live                                         |
| `409 Conflict`              | Aktywny klucz live, różna zawartość lub niespójne metadane             |
| `413 Payload Too Large`     | Przekroczenie skonfigurowanego limitu                                  |
| `500 Internal Server Error` | Nieoczekiwany błąd storage lub aplikacji                               |
| `502 Bad Gateway`           | Brak połączenia, timeout lub błąd proxy do firmware                    |

Broker na porcie `1883` używa protokołu MQTT i nie jest endpointem HTTP.
