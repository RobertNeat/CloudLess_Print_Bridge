# Endpointy komunikacyjne mqtt-puppeteer

Dokument opisuje wszystkie publiczne punkty komunikacji zaimplementowane w
serwisie: REST oraz Socket.IO.

Domyślny adres HTTP:

```text
http://localhost:3000
```

Port i interfejs można zmienić zmiennymi `PORT` oraz `HOST`.

## Wspólne zasady

- Requesty przyjmujące dane oczekują `Content-Type: application/json`.
- Publikacja komendy wymaga aktywnego połączenia MQTT.
- Odpowiedź `202 Accepted` potwierdza publikację do brokera, nie wykonanie
  polecenia przez drukarkę.
- Stan raw jest pełnym stanem złożonym przez deep merge wielu raportów.
- `mqtt.report` i `/mqtt/reports/latest` zawierają pojedynczy raport, a nie
  pełny stan.
- Model domenowy ma współdzielony kontrakt
  `PrinterDomainModelDto` z pakietu `@cloudless/printer-contracts`.

## REST — konfiguracja i transport MQTT

### `GET /mqtt/config`

Zwraca publiczną konfigurację połączenia. Hasło nigdy nie jest zwracane.

Kod sukcesu: `200 OK`.

Przykładowa odpowiedź:

```json
{
  "host": "192.168.1.103",
  "port": 8883,
  "username": "bblp",
  "printerSerial": "03919D581204433",
  "reportTopic": "device/03919D581204433/report",
  "commandTopic": "device/03919D581204433/request",
  "rejectUnauthorized": false,
  "connectTimeoutMs": 10000,
  "reconnectPeriodMs": 4000,
  "keepaliveSeconds": 60,
  "passwordConfigured": true
}
```

Pola opcjonalne, które nie zostały skonfigurowane, mogą być pominięte podczas
serializacji JSON.

### `GET /mqtt/status`

Zwraca aktualny stan transportu MQTT.

Kod sukcesu: `200 OK`.

```json
{
  "connected": true,
  "configured": true,
  "lastError": null,
  "subscribedTopic": "device/03919D581204433/report",
  "commandTopic": "device/03919D581204433/request"
}
```

`configured: false` oznacza, że aplikacja działa w trybie offline z powodu
braku wymaganej konfiguracji. Szczegóły znajdują się wtedy w `lastError`.

### `GET /mqtt/reports/latest`

Zwraca ostatni pojedynczy komunikat odebrany z topicu raportowego.

Kod sukcesu: `200 OK`.

Przed pierwszym raportem odpowiedzią jest:

```json
null
```

Po odebraniu raportu:

```json
{
  "topic": "device/03919D581204433/report",
  "receivedAt": "2026-07-23T10:15:30.000Z",
  "payload": {
    "print": {
      "nozzle_temper": 220
    }
  }
}
```

Poprawny JSON jest zwracany jako sparsowana wartość. Niepoprawny JSON jest
zwracany jako tekst UTF-8 i nie aktualizuje stanu drukarki.

### `POST /mqtt/commands/raw`

Publikuje przekazany obiekt bez używania katalogu nazwanych komend.

Kod sukcesu: `202 Accepted`.

Request:

```json
{
  "print": {
    "sequence_id": "0",
    "command": "gcode_line",
    "param": "G28\n"
  }
}
```

Odpowiedź:

```json
{
  "published": true,
  "topic": "device/03919D581204433/request",
  "qos": 0,
  "payload": {
    "print": {
      "sequence_id": "0",
      "command": "gcode_line",
      "param": "G28\n"
    }
  }
}
```

Możliwe błędy:

- `400 Bad Request` — body nie jest obiektem JSON;
- `503 Service Unavailable` — MQTT nie jest połączone lub publikacja nie
  powiodła się.

### `POST /mqtt/command`

Publikuje przekazany obiekt JSON do skonfigurowanego topicu komend drukarki.
Endpoint nie korzysta z katalogu nazwanych komend i nie wykonuje transformacji
payloadu.

Kod sukcesu: `202 Accepted`.

Request:

```json
{
  "print": {
    "sequence_id": "0",
    "command": "pause",
    "param": ""
  }
}
```

Odpowiedź:

```json
{
  "published": true,
  "topic": "device/03919D581204433/request",
  "qos": 0,
  "payload": {
    "print": {
      "sequence_id": "0",
      "command": "pause",
      "param": ""
    }
  }
}
```

Możliwe błędy:

- `400 Bad Request` — body nie jest obiektem JSON;
- `503 Service Unavailable` — klient MQTT nie jest połączony albo publikacja
  zakończyła się błędem.

### `POST /mqtt/request`

Publikuje request JSON bezpośrednio do skonfigurowanego topicu komend
drukarki. Endpoint przyjmuje kompletny payload protokołu urządzenia.

Kod sukcesu: `202 Accepted`.

Request:

```json
{
  "pushing": {
    "sequence_id": "0",
    "command": "pushall",
    "version": 1,
    "push_target": 1
  }
}
```

Odpowiedź:

```json
{
  "published": true,
  "topic": "device/03919D581204433/request",
  "qos": 0,
  "payload": {
    "pushing": {
      "sequence_id": "0",
      "command": "pushall",
      "version": 1,
      "push_target": 1
    }
  }
}
```

Możliwe błędy:

- `400 Bad Request` — body nie jest obiektem JSON;
- `503 Service Unavailable` — klient MQTT nie jest połączony albo publikacja
  zakończyła się błędem.

## REST — stan drukarki

### `GET /printer/state`

Zwraca jednocześnie metadane aktualizacji, pełny stan raw i model domenowy.

Kod sukcesu: `200 OK`.

```json
{
  "updatedAt": "2026-07-23T10:15:30.000Z",
  "raw": {
    "print": {
      "nozzle_temper": 220,
      "gcode_state": "RUNNING"
    }
  },
  "domain": {
    "temperatures": {
      "nozzle": {
        "current": 220
      }
    },
    "job": {
      "status": "running"
    }
  }
}
```

### `GET /printer/state/raw`

Zwraca wyłącznie pełny stan protokołowy po deep merge.

Kod sukcesu: `200 OK`.

Bez raportów i bez `PRINTER_STATE_TEMPLATE_PATH` zwraca `{}`.

### `GET /printer/state/domain`

Zwraca wyłącznie model biznesowy zgodny z
`PrinterDomainModelDto` z `@cloudless/printer-contracts`.

Kod sukcesu: `200 OK`.

```json
{
  "temperatures": {
    "nozzle": {
      "current": 220,
      "target": 220
    },
    "bed": {
      "current": 60,
      "target": 60
    }
  },
  "job": {
    "status": "running",
    "progressPercent": 74,
    "remainingSeconds": 480,
    "currentLayer": 111,
    "totalLayers": 161,
    "fileName": "model.gcode.3mf"
  },
  "fans": {
    "heatbreakPercent": 67,
    "coolingPercent": 73
  },
  "lightOn": false,
  "speedPercent": 100
}
```

Pola, których drukarka jeszcze nie zaraportowała, są pomijane.

### `GET /json_model`

Zwraca kompletny stan protokołowy drukarki utworzony przez deep merge
wszystkich poprawnych raportów MQTT odebranych od uruchomienia procesu.

Kod sukcesu: `200 OK`.

```json
{
  "print": {
    "nozzle_temper": 220,
    "bed_temper": 60,
    "gcode_state": "RUNNING",
    "online": {
      "rfid": true
    }
  }
}
```

Endpoint zwraca kopię stanu. Bez raportów i bez skonfigurowanego template'u
zwraca `{}`.

### `GET /domain_model`

Zwraca aktualny model biznesowy drukarki zgodny z
`PrinterDomainModelDto` z pakietu `@cloudless/printer-contracts`.

Kod sukcesu: `200 OK`.

```json
{
  "temperatures": {
    "nozzle": {
      "current": 220
    },
    "bed": {
      "current": 60
    }
  },
  "job": {
    "status": "running",
    "progressPercent": 74
  }
}
```

Pola, których nie można jeszcze wyznaczyć z odebranych raportów, są pomijane.

## REST — katalog komend

### `GET /commands`

Zwraca metadane aktywnego katalogu komend.

Kod sukcesu: `200 OK`.

```json
[
  {
    "id": "set-bed-temperature",
    "description": "Set the build plate target temperature",
    "parameters": {
      "celsius": {
        "type": "number",
        "required": true,
        "minimum": 0,
        "maximum": 120
      }
    },
    "source": "built-in:bambu-lab-a1-tested-command-patterns"
  }
]
```

Lista zależy od `COMMAND_CATALOG_PATH` i `COMMAND_CATALOG_MODE`.

Wbudowany profil A1 udostępnia między innymi:

- `pause-print`, `resume-print`, `cancel-print`;
- `set-print-speed`;
- `load-filament`, `unload-filament`, `set-filament`;
- komendy temperatury, wentylatora, światła, ruchu i ekstrudera.

### `GET /commands/profile`

Zwraca aktywny adapter komend i obsługiwaną topologię filamentów.

Kod sukcesu: `200 OK`.

```json
{
  "id": "bambu-lab-a1",
  "topology": {
    "unitCount": 2,
    "slotsPerUnit": 4,
    "externalSpool": true
  }
}
```

### Uniwersalne komendy zarządzania drukiem

```http
POST /commands/pause-print
POST /commands/resume-print
POST /commands/cancel-print
```

Każda z nich przyjmuje pusty obiekt `{}`.

Prędkość jest przekazywana jako stabilna wartość domenowa, a profil drukarki
odpowiada za jej odwzorowanie na protokół:

```http
POST /commands/set-print-speed
```

```json
{
  "mode": "sport"
}
```

Dozwolone wartości: `silent`, `standard`, `sport`, `ludicrous`.

### Uniwersalne komendy filamentu

Załadowanie filamentu z AMS:

```http
POST /commands/load-filament
```

```json
{
  "sourceKind": "ams",
  "amsUnitId": 1,
  "slotId": 2,
  "filamentId": "generic-petg"
}
```

Numer urządzenia i slotu są indeksowane od zera. Profil sprawdza je względem
topologii zwracanej przez `GET /commands/profile`.

Załadowanie ze szpuli zewnętrznej:

```json
{
  "sourceKind": "external",
  "targetTemperature": 240
}
```

`load-filament` wymaga `filamentId` albo `targetTemperature`. Jeśli podano
profil filamentu, domyślną temperaturą docelową jest jego maksymalna
temperatura dyszy.

Rozładowanie aktualnie używanego filamentu:

```http
POST /commands/unload-filament
```

```json
{}
```

Przypisanie definicji do slotu:

```http
POST /commands/set-filament
```

```json
{
  "sourceKind": "ams",
  "amsUnitId": 0,
  "slotId": 3,
  "filamentId": "generic-pla",
  "trayColor": "FFFF00FF"
}
```

`trayColor` musi mieć format `RRGGBBAA`. Opcjonalne
`nozzleTemperatureMin` i `nozzleTemperatureMax` nadpisują profil, ale minimum
nie może przekraczać maksimum.

### `POST /commands/:id/preview`

Waliduje parametry i renderuje payload bez publikowania go do MQTT. Endpoint
jest dostępny również w trybie offline.

Kod sukcesu: `201 Created`.

Request:

```http
POST /commands/move-absolute/preview
Content-Type: application/json
```

```json
{
  "x": 125,
  "y": 125,
  "z": 20
}
```

Odpowiedź:

```json
{
  "commandId": "move-absolute",
  "payload": {
    "print": {
      "sequence_id": "0",
      "command": "gcode_line",
      "param": "G90\nG1 X125 Y125 Z20 F3000\n"
    }
  }
}
```

Możliwe błędy:

- `400 Bad Request` — brak wymaganego parametru, nieprawidłowy typ, nieznany
  parametr albo wartość poza zakresem;
- `404 Not Found` — nieznane `id` komendy.

### `POST /commands/:id`

Waliduje parametry, buduje payload i publikuje go do MQTT.

Kod sukcesu: `202 Accepted`.

Request jest identyczny jak dla `preview`.

```json
{
  "published": true,
  "topic": "device/03919D581204433/request",
  "qos": 0,
  "payload": {
    "print": {
      "sequence_id": "0",
      "command": "gcode_line",
      "param": "G90\nG1 X125 Y125 Z20 F3000\n"
    }
  },
  "commandId": "move-absolute"
}
```

Możliwe błędy:

- `400 Bad Request` — błędne parametry;
- `404 Not Found` — nieznana komenda;
- `503 Service Unavailable` — MQTT nie jest połączone lub publikacja nie
  powiodła się.

## REST — definicje filamentów

### `GET /filaments`

Zwraca rozwiązane definicje gotowe do prezentacji na frontendzie i użycia
przez `filamentId`.

Kod sukcesu: `200 OK`.

```json
[
  {
    "id": "generic-petg",
    "displayName": "Generic PETG",
    "filamentTypeId": "petg",
    "filamentBrand": "Generic",
    "trayInfoIdx": "GFG99",
    "trayType": "PETG",
    "trayColor": "FFFFFFFF",
    "nozzleTemperatureMin": 220,
    "nozzleTemperatureMax": 270
  }
]
```

### `GET /filaments/catalog`

Zwraca pełny katalog:

- `types` — bazowe materiały z `trayType`, kolorem i temperaturami;
- `metaTypes` — mapowanie typu i marki na `trayInfoIdx`;
- `resolved` — połączone definicje używane przez komendy.

### `GET /filaments/:id`

Zwraca jedną rozwiązaną definicję. Nieznany identyfikator powoduje
`404 Not Found`.

## Socket.IO

Namespace:

```text
http://localhost:3000/printer
```

Po połączeniu klient od razu otrzymuje `mqtt.status`, oba warianty stanu oraz
ostatni `mqtt.report`, jeśli raport był wcześniej dostępny.

### Zdarzenia serwer → klient

#### `mqtt.status`

Wysyłane po połączeniu klienta oraz po zmianie stanu MQTT.

Payload jest identyczny z odpowiedzią `GET /mqtt/status`.

#### `mqtt.report`

Wysyłane dla każdego raportu MQTT oraz przy połączeniu nowego klienta, jeżeli
istnieje ostatni raport.

Payload jest identyczny z odpowiedzią `GET /mqtt/reports/latest` po odebraniu
raportu.

#### `printer.state.raw`

Wysyłane po każdej poprawnej aktualizacji oraz przy połączeniu klienta.

```json
{
  "updatedAt": "2026-07-23T10:15:30.000Z",
  "state": {
    "print": {
      "nozzle_temper": 220
    }
  }
}
```

#### `printer.state.domain`

Wysyłane razem z `printer.state.raw`.

```json
{
  "updatedAt": "2026-07-23T10:15:30.000Z",
  "state": {
    "temperatures": {
      "nozzle": {
        "current": 220
      }
    }
  }
}
```

Pole `state` jest zgodne z `PrinterDomainModelDto`.

#### `printer.command.accepted`

Wysyłane tylko do klienta, który przesłał komendę, po udanej publikacji MQTT.
Payload odpowiada rezultatowi `POST /commands/:id` albo
`POST /mqtt/commands/raw`.

Nie jest to potwierdzenie wykonania komendy przez urządzenie.

#### `exception`

Standardowe zdarzenie błędu NestJS Socket.IO. Może informować o:

- brakującym lub nieprawidłowym `id`;
- błędnych parametrach;
- nieznanej komendzie;
- braku połączenia MQTT;
- błędzie publikacji.

### Zdarzenia klient → serwer

#### `printer.command`

Uruchamia nazwaną komendę z aktywnego katalogu.

```json
{
  "id": "set-light",
  "parameters": {
    "enabled": true
  }
}
```

Po sukcesie klient otrzymuje `printer.command.accepted`. Handler Socket.IO
zwraca również ten sam rezultat jako odpowiedź dla klienta używającego
acknowledgement callback.

#### `mqtt.command.raw`

Publikuje surowy obiekt JSON z pominięciem katalogu komend.

```json
{
  "print": {
    "sequence_id": "0",
    "command": "gcode_line",
    "param": "G28\n"
  }
}
```

Po sukcesie klient otrzymuje `printer.command.accepted`.

## Interpretacja potwierdzeń drukarki

Transport MQTT potwierdza jedynie, że broker przyjął publikację. Raport
zawierający odpowiedź drukarki będzie dostępny przez:

- `mqtt.report`;
- `GET /mqtt/reports/latest`;
- zaktualizowany `printer.state.raw`;
- zaktualizowany `printer.state.domain`.

Znaczenie pól akceptacji lub błędu urządzenia zależy od protokołu konkretnego
modelu drukarki i powinno być interpretowane przez właściwy profil domenowy.
