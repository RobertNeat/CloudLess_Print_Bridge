# Endpointy mqtt-puppeteer

Domyślny adres HTTP to `http://localhost:10320`, a namespace Socket.IO to
`http://localhost:10320/printer`.

## Wspólne zasady

- Body operacji przyjmujących parametry musi być obiektem JSON.
- `202 Accepted` potwierdza publikację MQTT, nie wykonanie przez drukarkę.
- `400 Bad Request` oznacza błędny payload lub parametry.
- `404 Not Found` oznacza nieznaną trasę, komendę albo definicję.
- `503 Service Unavailable` oznacza brak połączenia MQTT lub błąd publikacji.
- Stan `merged` powstaje przez deep merge poprawnych raportów MQTT.
- Stan `domain` jest zgodny z `PrinterDomainModelDto`.
- Każdy POST otrzymuje generowany przez serwis `operationId`.
- Dla komend `operationId` zastępuje protokołowe `sequence_id`.
- Odpowiedzi błędów również zawierają `operationId`.

## 1. Service

### `GET /service/config`

Zwraca publiczną konfigurację transportu i `operationTimeoutMs`. Hasło nigdy
nie jest zwracane.

### `GET /service/status`

Zwraca pola `connected`, `configured`, `lastError`, `subscribedTopic`
i `commandTopic`.

### `GET /service/reports/latest`

Zwraca ostatni pojedynczy raport wraz z `topic` i `receivedAt`, albo `null`
przed odebraniem pierwszego raportu.

## 2. Device config

### `GET /device_config/profile`

Zwraca identyfikator aktywnego profilu oraz topologię AMS:

```json
{
  "id": "bambu-lab-a1",
  "topology": {
    "unitCount": 1,
    "slotsPerUnit": 4,
    "externalSpool": true
  }
}
```

### `GET /device_config/state/merged`

Zwraca wyłącznie pełny stan protokołowy złożony przez deep merge. Nie zawiera
opakowania z modelem domenowym ani czasu aktualizacji.

### `GET /device_config/state/domain`

Zwraca wyłącznie pełny `PrinterDomainModelDto`. Nie zawiera surowych pól
protokołu.

AMS ma jawny kontrakt domenowy:

```json
{
  "ams": {
    "units": [
      {
        "id": "ams-unit-0",
        "position": 0,
        "humidityPercent": 42,
        "temperatureCelsius": 24.5,
        "slots": [
          {
            "id": "ams-unit-0-slot-2",
            "unitId": "ams-unit-0",
            "position": 2,
            "occupied": true,
            "active": true,
            "filament": {
              "id": "generic-petg",
              "displayName": "Generic PETG",
              "type": "PETG",
              "brand": "Generic"
            },
            "color": "AABBCCDD",
            "remainingPercent": 80,
            "nozzleTemperatureMin": 220,
            "nozzleTemperatureMax": 270
          }
        ]
      }
    ],
    "externalSpool": {
      "id": "external-spool",
      "occupied": false,
      "active": false
    },
    "activeSourceId": "ams-unit-0-slot-2"
  }
}
```

Mapper przyjmuje tylko skończone liczby i niepuste teksty liczbowe. Odrzuca
`null`, pusty tekst, wartości logiczne, liczby nieskończone oraz wartości poza
zakresem domenowym temperatur, procentów, wentylatorów i warstw.

## 3. Print job

Wszystkie operacje zwracają `202 Accepted`.

### `POST /print_job/pause`

Wstrzymuje aktualny druk. Body nie jest wymagane.

### `POST /print_job/resume`

Wznawia aktualny druk. Body nie jest wymagane.

### `POST /print_job/cancel`

Anuluje aktualny druk. Body nie jest wymagane.

### `POST /print_job/speed`

```json
{ "mode": "sport" }
```

Dozwolone tryby: `silent`, `standard`, `sport`, `ludicrous`.

## 4. Filament

### `GET /filament/definitions`

Zwraca pojedynczą listę scalonych definicji filamentu gotowych do użycia
przez komendy.

### `GET /filament/manufacturers/:manufacturer/definitions`

Zwraca tę samą postać listy, ograniczoną do producenta. Porównanie nazwy
producenta nie rozróżnia wielkości liter.

### `GET /filament/definitions/:id`

Zwraca jedną scaloną definicję albo `404 Not Found`.

### `POST /filament/load`

Ładowanie z AMS:

```json
{
  "sourceKind": "ams",
  "amsUnitId": 0,
  "slotId": 2,
  "filamentId": "generic-petg"
}
```

Ładowanie ze szpuli zewnętrznej:

```json
{
  "sourceKind": "external",
  "targetTemperature": 240
}
```

Wymagane jest `filamentId` albo `targetTemperature`.

### `POST /filament/unload`

Rozładowuje aktualnie używany filament. Body nie jest wymagane.

### `POST /filament/define`

Przypisuje definicję do slotu AMS lub szpuli zewnętrznej:

```json
{
  "sourceKind": "ams",
  "amsUnitId": 0,
  "slotId": 3,
  "filamentId": "generic-pla",
  "trayColor": "FFFF00FF"
}
```

`trayColor` ma format `RRGGBBAA`. Opcjonalne temperatury minimalna
i maksymalna mogą nadpisać wartości definicji.

## 5. Movement

### `POST /movement/absolute`

Waliduje i publikuje ruch jednej lub wielu osi w trybie absolutnym:

```json
{
  "x": 125,
  "y": 125,
  "z": 20,
  "feedrate": 3000
}
```

Co najmniej jedna z osi jest wymagana. Profil A1 ogranicza X/Y do `0..256`,
Z do `20..240`, a feedrate do `1..30000`.

### `POST /movement/absolute/simulate`

Wykonuje tę samą walidację i buduje identyczny payload, ale nie publikuje go
do MQTT. Zwraca `200 OK`:

```json
{
  "operationId": "a1b2c3d4-...",
  "commandId": "move-absolute",
  "payload": {
    "print": {
      "sequence_id": "a1b2c3d4-...",
      "command": "gcode_line",
      "param": "G90\nG1 X125 Y125 Z20 F3000\n"
    }
  }
}
```

### `POST /movement/home`

Ustawia pozycję domową wszystkich osi. Body nie jest wymagane.

### `POST /movement/extrude-relative`

```json
{
  "millimeters": 10,
  "feedrate": 600
}
```

Ujemne `millimeters` oznacza retrakcję. Profil A1 dopuszcza zakres
`-50..50`.

## 6. Commands

### `GET /commands`

Zwraca listę wszystkich zaimportowanych definicji wraz z parametrami,
uwagami bezpieczeństwa i źródłem.

### `POST /commands/:id`

Waliduje parametry, buduje payload przez profil i publikuje go do MQTT.
Endpointy z grup `print_job`, `filament` i `movement` delegują do tej samej
logiki.

### `POST /commands/raw`

Jedyny endpoint REST publikujący surowy obiekt z pominięciem katalogu:

```json
{
  "print": {
    "sequence_id": "0",
    "command": "gcode_line",
    "param": "G28\n"
  }
}
```

Istniejące `sequence_id` jest zastępowane przez `operationId`. Jeżeli obiekt
komendy nie ma tego pola, serwis je dodaje.

## Socket.IO

### Serwer → klient

| Zdarzenie | Dane |
| --- | --- |
| `service.status` | odpowiednik `GET /service/status` |
| `service.report` | odpowiednik `GET /service/reports/latest` po raporcie |
| `device_config.state.merged` | `{ updatedAt, state }` ze stanem scalonym |
| `device_config.state.domain` | `{ updatedAt, state }` z modelem domenowym |
| `service.mqtt.publish` | status `published` lub `failed` każdej próby publikacji |
| `service.operation.result` | końcowy status `acknowledged`, `rejected` albo `timed_out` |
| `service.error` | wyjątek REST albo asynchroniczny błąd MQTT |

Po połączeniu klient od razu otrzymuje status i oba warianty stanu. Ostatni
raport jest wysyłany, jeżeli już istnieje.

`service.mqtt.publish` zawiera `operationId`, opcjonalny `commandId`,
`occurredAt`, `topic`, `qos`, opcjonalny `payload` oraz — dla statusu
`failed` — pole `error`. Zdarzenie jest emitowane centralnie przez transport,
dlatego obejmuje każdą publikację z endpointów REST, w tym komendy raw.

`service.operation.result` jest emitowane raz dla operacji. Raport urządzenia
z odpowiadającym `sequence_id` kończy ją jako `acknowledged` albo `rejected`.
Brak odpowiedzi przez `MQTT_PUPPETEER_OPERATION_TIMEOUT_MS` kończy ją jako `timed_out`.

`service.error` zawiera opcjonalny `operationId`, źródło `http` albo `mqtt`,
czas, nazwę i komunikat błędu. Dla błędów HTTP zawiera również kod statusu,
metodę i ścieżkę.

### Klient → serwer

Brak. Socket.IO jest kanałem wyłącznie odbiorczym. Komendy i symulacje są
wywoływane przez REST.
