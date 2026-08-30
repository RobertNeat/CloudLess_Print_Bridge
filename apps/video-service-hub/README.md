# Video Service Hub

Backend pośredniczący między klientami systemu a kamerami M5Stack UnitCam S3.
Serwis:

- przekazuje zwalidowane komendy do REST API firmware;
- odbiera i trwale zapisuje JPEG, części MJPEG, WAV oraz transmisje live;
- udostępnia aktywny live MJPEG wielu odbiorcom;
- prowadzi manifesty nagrań i odtwarza je po restarcie;
- uruchamia lokalny broker MQTT albo łączy się z brokerem zewnętrznym;
- zbiera ostatnią telemetrię i stan obecności kamer.

Implementacja odpowiada kontraktowi firmware znajdującemu się w
`firmware/m5-stack-unitcam-s3`.

## Uruchomienie

Z katalogu głównego monorepo:

```powershell
pnpm install
pnpm --filter @cloudless/video-service-hub start:dev
```

Domyślnie HTTP działa na `0.0.0.0:10222`, MQTT na `0.0.0.0:1883`, a pliki
trafiają do `./storage` względem katalogu roboczego procesu. W konfiguracji
kamery `videoServiceIp` musi wskazywać adres LAN hosta serwisu.

## Organizacja

```text
src/
├── camera-commands/  # walidacja i proxy komend do firmware
├── common/           # walidacja identyfikatorów i blokady per zasób
├── config/           # jedna, walidowana konfiguracja runtime
├── health/           # stan storage i MQTT
├── ingest/           # kontroler binarnych uploadów i live preview
├── mqtt/             # broker/adapter, obserwator i telemetry store
└── storage/          # atomowy zapis, manifesty, limity i live fan-out
```

`/test/*` z projektu PoC nie jest publicznym API tego serwisu. Symulowanie
awarii, kasowanie całego storage i resetowanie telemetrii bez autoryzacji
pozostają odpowiedzialnością testów.

## API

### Komendy

```http
POST /api/v1/cameras/:cameraId/commands/:command
Content-Type: application/json

{
  "cameraBaseUrl": "http://192.168.1.231",
  "requestId": "recording-001",
  "resolution": "VGA",
  "durationMs": 30000
}
```

Obsługiwane komendy:

- `capture`
- `periodic-capture`
- `timed-recording`
- `start-recording`
- `stop-recording`
- `start-live`
- `start-dynamic-live`
- `stop-live`
- `record-audio`

Parametry są sprawdzane zgodnie z limitami firmware przed połączeniem z kamerą.
Status odpowiedzi firmware jest przekazywany klientowi.

### Ingest z firmware

| Metoda | Trasa | Typ |
| --- | --- | --- |
| `POST` | `/api/v1/cameras/:cameraId/captures` | `image/jpeg` |
| `POST` | `/api/v1/cameras/:cameraId/recordings/:requestId/parts/:partNumber` | `multipart/x-mixed-replace` |
| `POST` | `/api/v1/cameras/:cameraId/audio` | `audio/wav` |
| `POST` | `/api/v1/cameras/:cameraId/live` | strumień `multipart/x-mixed-replace` |
| `GET` | `/api/v1/cameras/:cameraId/live?requestId=...` | aktywny live MJPEG |

Nagłówki wymagane przez te trasy są zgodne z aktualnym firmware. Capture
akceptuje dodatkowo opcjonalny `X-Capture-Sequence`. Gdy urządzenie go wysyła,
retry tego samego zdjęcia jest w pełni idempotentny. Bez tego nagłówka serwis
nadaje kolejną sekwencję, co zachowuje wszystkie klatki z obecnego firmware,
ale nie pozwala odróżnić ponowienia od dwóch identycznych zdjęć. To ograniczenie
obecnego protokołu urządzenia, nie storage.

### Odczyt stanu

| Metoda | Trasa | Zastosowanie |
| --- | --- | --- |
| `GET` | `/health` | gotowość storage i połączenia MQTT |
| `GET` | `/api/v1/cameras` | kamery wykryte przez telemetrię |
| `GET` | `/api/v1/cameras/:cameraId/telemetry` | ostatnia wiadomość każdego kanału |

## Storage

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

Upload jest najpierw zapisywany i hashowany w `.tmp`, a dopiero kompletny plik
jest publikowany. Części nagrania, audio i capture z podaną sekwencją są
idempotentne: identyczny retry zwraca sukces, inna zawartość pod tym samym
kluczem zwraca `409`. Manifest nagrania staje się kompletny wyłącznie po
otrzymaniu wszystkich kolejnych części.

## Konfiguracja

| Zmienna | Domyślnie | Znaczenie |
| --- | ---: | --- |
| `VIDEO_SERVICE_HUB_HOST` | `0.0.0.0` | adres nasłuchu HTTP |
| `VIDEO_SERVICE_HUB_PORT` | `10222` | port HTTP |
| `VIDEO_SERVICE_HUB_STORAGE_PATH` | `./storage` | katalog danych |
| `VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS` | `10000` | timeout proxy do kamery |
| `VIDEO_SERVICE_HUB_MQTT_PORT` | `1883` | port brokera embedded (`0` w testach) |
| `VIDEO_SERVICE_HUB_MQTT_URL` | — | broker zewnętrzny; wyłącza embedded |
| `VIDEO_SERVICE_HUB_MQTT_USERNAME`, `VIDEO_SERVICE_HUB_MQTT_PASSWORD` | — | dane brokera zewnętrznego |
| `VIDEO_SERVICE_HUB_MQTT_CONNECT_TIMEOUT_MS` | `10000` | timeout pierwszego połączenia |
| `VIDEO_SERVICE_HUB_MQTT_RECONNECT_PERIOD_MS` | `1000` | odstęp reconnect |
| `VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS` | `60000` | czas uznania kamery za online |
| `VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES` | `20971520` | limit JPEG |
| `VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES` | `16777216` | limit części MJPEG |
| `VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES` | `10485760` | limit WAV |
| `VIDEO_SERVICE_HUB_LIVE_MAX_BYTES` | `1073741824` | limit pojedynczego live |
| `VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES` | `2097152` | bufor wolnego odbiorcy live |

Serwis jest przeznaczony do zaufanej sieci lokalnej. Komendy przyjmują adres
kamery od klienta, więc przed wystawieniem API poza LAN trzeba dodać
uwierzytelnianie/autoryzację oraz rejestr dozwolonych kamer.

## Weryfikacja

```powershell
pnpm --filter @cloudless/video-service-hub format
pnpm --filter @cloudless/video-service-hub lint
pnpm --filter @cloudless/video-service-hub build
pnpm --filter @cloudless/video-service-hub test --runInBand
pnpm --filter @cloudless/video-service-hub test:e2e --runInBand
```
