# Endpointy mqtt-puppeteer

Domyślny adres HTTP to `http://localhost:10320`, a namespace Socket.IO to
`http://localhost:10320/printer`.

Interaktywna dokumentacja Swagger/OpenAPI jest dostępna pod `/docs`
(surowy dokument JSON pod `/docs-json`) i jest generowana bezpośrednio
z adnotacji kontrolerów, więc nie może rozjechać się z kodem tak jak ten
plik.

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

Zwraca identyfikator aktywnego profilu, topologię AMS oraz bezpieczny
zakres ruchu (`machineEnvelope`) tego profilu:

```json
{
  "id": "bambu-lab-a1",
  "topology": {
    "unitCount": 1,
    "slotsPerUnit": 4,
    "externalSpool": true
  },
  "machineEnvelope": {
    "x": { "minimum": 0, "maximum": 256 },
    "y": { "minimum": 0, "maximum": 256 },
    "z": { "minimum": 20, "maximum": 240 }
  }
}
```

`machineEnvelope` powinien być odczytany przez frontend przed
wyrenderowaniem sterowania ruchem, aby ograniczyć suwaki/pola liczbowe do
bezpiecznego zakresu (pierwsza warstwa weryfikacji). Backend egzekwuje ten
sam zakres niezależnie — patrz sekcja „Podwójna weryfikacja granic ruchu”
poniżej — więc żądanie poza zakresem zostanie odrzucone nawet jeśli
frontend go nie ograniczy.

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

Model domenowy zawiera również `position` — pozycję głowicy śledzoną metodą
„dead reckoning" (na podstawie wysłanych komend `home`/`move-absolute`), a
**nie** odczyt z czujnika:

```json
{
  "position": {
    "x": 125,
    "y": 125,
    "z": 20,
    "homed": true,
    "source": "commanded",
    "updatedAt": "2026-09-12T10:00:00.000Z"
  }
}
```

Raport `pushall` drukarki Bambu Lab A1 nie zawiera aktualnej pozycji XYZ,
dlatego `position` jest wyliczana wyłącznie na podstawie komend, które serwis
sam opublikował:

- `source: "unknown"` — jeszcze żadna komenda ruchu nie została opublikowana
  (lub połączenie MQTT właśnie się zerwało — `mqttStatus$.connected === false`
  unieważnia śledzoną pozycję);
- `source: "homed"` — ostatnią potwierdzoną operacją było `home`;
- `source: "commanded"` — ostatnią potwierdzoną operacją był `move-absolute`.

Frontend nie powinien prezentować `position` jako pomiaru w czasie
rzeczywistym — to najlepsze dostępne przybliżenie na podstawie historii
komend.

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

### Podwójna weryfikacja granic ruchu

Granice `X: 0..256`, `Y: 0..256`, `Z: 20..240` (profil A1) są egzekwowane
dwukrotnie, niezależnie od siebie:

1. **Warstwa parametrów** — `CommandCatalogService` odrzuca żądanie z kodem
   `400 Bad Request` zanim payload zostanie zbudowany, jeśli parametr
   `x`/`y`/`z` komendy `move-absolute` wykracza poza zakres zdefiniowany
   przez profil.
2. **Warstwa transportu** — `MqttTransportService.publish()` wywołuje
   `PrinterCommandProfile.inspectPayload()` na **każdym** payloadzie tuż
   przed publikacją do MQTT, niezależnie od tego, czy payload powstał
   z katalogu komend, czy trafił bezpośrednio przez `POST /commands/raw`.
   Ten sam gcode ruchu (`G1 X.. Y.. Z..`) jest parsowany i porównywany
   z `machineEnvelope` profilu.

Dzięki warstwie 2 nie da się ominąć limitów osi wysyłając ręcznie
spreparowany gcode przez `POST /commands/raw` — jest to jedyny endpoint,
który omija walidację parametrów katalogu, ale nie omija sprawdzenia
bezpieczeństwa payloadu. Żadna liczba graniczna nie jest zaszyta poza
`printer-profiles/bambu-lab-a1/` — inny profil drukarki zmienia
`machineEnvelope` bez zmian w generycznym kodzie transportu.

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
Z do `20..240`, a feedrate do `1..30000`. Zakres można też pobrać w runtime
z `GET /device_config/profile` (`machineEnvelope`), by ograniczyć suwaki UI
przed wysłaniem żądania.

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

## 6. Printer controls

Cienkie, gotowe pod widgety dashboardu endpointy, które jedynie przekazują
żądanie do istniejącej komendy katalogu — nie zawierają własnej wiedzy
o konkretnym modelu drukarki.

### `POST /printer-controls/light`

```json
{ "enabled": true }
```

Deleguje do komendy `set-light`.

### `POST /printer-controls/fan`

```json
{ "percent": 50 }
```

Zakres `0..100`. Deleguje do komendy `set-part-fan`.

### `POST /printer-controls/print-speed`

```json
{ "mode": "sport" }
```

Deleguje do komendy `set-print-speed` (`silent`, `standard`, `sport`,
`ludicrous`).

### `POST /printer-controls/temperature/bed`

```json
{ "celsius": 55 }
```

Zakres `0..120`. Deleguje do komendy `set-bed-temperature`.

### `POST /printer-controls/temperature/nozzle`

```json
{ "celsius": 220 }
```

Zakres `0..300`. Deleguje do komendy `set-nozzle-temperature`.

> Komora (chamber) drukarki A1 nie ma grzałki — nie istnieje komenda
> `set-chamber-temperature` i celowo nie ma tu endpointu
> `printer-controls/temperature/chamber`. Odczyt temperatury komory
> pozostaje dostępny wyłącznie do odczytu w modelu domenowym.

## 7. Telemetry

### `GET /telemetry/history`

Zwraca ograniczony bufor historii (kołowy, rozmiar konfigurowalny przez
`MQTT_PUPPETEER_TELEMETRY_HISTORY_CAPACITY`, domyślnie 720 próbek) wyliczany
z modelu domenowego przy każdej aktualizacji stanu drukarki — nie z surowych
pól protokołu, więc bufor pozostaje ważny niezależnie od aktywnego profilu:

```json
{
  "capacity": 720,
  "samples": [
    {
      "capturedAt": "2026-09-12T10:00:00.000Z",
      "progressPercent": 42,
      "nozzleTemperatureCurrent": 210,
      "nozzleTemperatureTarget": 220,
      "bedTemperatureCurrent": 55,
      "bedTemperatureTarget": 60,
      "chamberTemperatureCurrent": 30,
      "coolingFanPercent": 80,
      "auxiliaryFanPercent": 20
    }
  ]
}
```

Służy do zasilenia wykresów dashboardu od razu po połączeniu, zamiast
czekania na kolejne zdarzenia `device_config.state.domain` przez Socket.IO.

### `DELETE /telemetry/history`

Czyści bufor. Zwraca `204 No Content`. Przydatne głównie w testach.

## 8. Commands

### `GET /commands`

Zwraca listę wszystkich zaimportowanych definicji wraz z parametrami,
uwagami bezpieczeństwa i źródłem. Ta odpowiedź jest wystarczająca, by
frontend wygenerował formularz dla każdej komendy bez zaszytej wiedzy
o konkretnym modelu drukarki.

Statyczna, czytelna dla człowieka wersja aktualnie załadowanego katalogu
(dla domyślnego profilu Bambu Lab A1) jest utrzymywana w
[command-catalog.md](./command-catalog.md) i generowana z tego samego kodu
przez `pnpm docs:commands` — nie da się jej ręcznie rozjechać z tym, co
faktycznie zwraca ten endpoint.

### `POST /commands/:id`

Waliduje parametry, buduje payload przez profil i publikuje go do MQTT.
Endpointy z grup `print_job`, `filament` i `movement` delegują do tej samej
logiki.

### `POST /commands/raw`

Jedyny endpoint REST publikujący surowy obiekt z pominięciem katalogu i jego
walidacji parametrów:

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

Pominięcie katalogu **nie** oznacza pominięcia bezpieczeństwa: payload nadal
przechodzi przez `PrinterCommandProfile.inspectPayload()` w
`MqttTransportService.publish()` przed wysłaniem do MQTT. Gcode ruchu poza
`machineEnvelope` profilu (patrz sekcja 5) zwraca `400 Bad Request` zamiast
trafić do drukarki.

## CORS

Zarówno REST (`app.enableCors()` w `main.ts`), jak i Socket.IO (namespace
`/printer`) czytają dozwolone originy z tej samej konfiguracji:
`MQTT_PUPPETEER_CORS_ORIGINS` — lista adresów rozdzielonych przecinkiem, np.

```
MQTT_PUPPETEER_CORS_ORIGINS=http://localhost:4200,https://dashboard.example.com
```

Wartość `*` włącza tryb odbijania dowolnego originu (wygodne w
developmencie, niezalecane produkcyjnie). Domyślnie skonfigurowany jest
tylko lokalny adres deweloperski `octo-management-dashboard`
(`http://localhost:4200`), więc dashboard działa "out of the box" bez
dodatkowej konfiguracji w środowisku lokalnym.

`credentials: true` jest włączone na obu warstwach, co jest wymagane, aby
przeglądarka wysyłała nagłówek `Authorization` (bearer token z
`POST /auth/token`) w żądaniach cross-origin z dashboardu.

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
