# mqtt-puppeteer

Lokalny bridge NestJS do drukarki 3D. Serwis łączy się z brokerem drukarki
przez MQTT/TLS, scala częściowe raporty i udostępnia uporządkowane API REST
oraz Socket.IO.

Szczegółowa dokumentacja:

- [endpointy REST i zdarzenia Socket.IO](./docs/endpoints.md);
- [architektura i przepływy danych](./docs/architecture.md).

## Obszary API

Publiczny kontrakt jest podzielony według odpowiedzialności:

| Obszar | Odpowiedzialność |
| --- | --- |
| `service` | konfiguracja i stan działania bridge'a oraz transportu MQTT |
| `device_config` | profil drukarki, topologia AMS i aktualny stan urządzenia |
| `print_job` | sterowanie bieżącym zadaniem druku |
| `filament` | definicje filamentów oraz ładowanie, rozładowanie i przypisanie do slotu |
| `movement` | ruch absolutny XYZ, home, ekstruder względny i symulacja ruchu |
| `commands` | katalog, wykonanie komendy po identyfikatorze i pojedynczy raw publish |

## Konfiguracja

Minimalny `.env` w katalogu głównym monorepo:

```env
MQTT_PUPPETEER_MQTT_HOST=192.168.1.103
MQTT_PUPPETEER_MQTT_PORT=8883
MQTT_PUPPETEER_MQTT_USERNAME=bblp
MQTT_PUPPETEER_MQTT_PASSWORD=your_lan_access_code
MQTT_PUPPETEER_PRINTER_SN=03919D581204433
MQTT_PUPPETEER_PORT=10220
```

Domyślne topics to `device/${MQTT_PUPPETEER_PRINTER_SN}/report` i
`device/${MQTT_PUPPETEER_PRINTER_SN}/request`. Można je zastąpić przez `MQTT_PUPPETEER_MQTT_REPORT_TOPIC`
i `MQTT_PUPPETEER_MQTT_COMMAND_TOPIC`.

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `MQTT_PUPPETEER_HOST` | `0.0.0.0` | host HTTP |
| `MQTT_PUPPETEER_MQTT_REJECT_UNAUTHORIZED` | `false` | weryfikacja certyfikatu TLS |
| `MQTT_PUPPETEER_MQTT_CONNECT_TIMEOUT_MS` | `10000` | timeout połączenia |
| `MQTT_PUPPETEER_MQTT_RECONNECT_PERIOD_MS` | `4000` | odstęp reconnect |
| `MQTT_PUPPETEER_MQTT_KEEPALIVE_SECONDS` | `60` | keepalive MQTT |
| `MQTT_PUPPETEER_PRINTER_STATE_TEMPLATE_PATH` | brak | opcjonalny początkowy obiekt JSON |
| `MQTT_PUPPETEER_COMMAND_CATALOG_PATH` | brak | zewnętrzny katalog komend JSON |
| `MQTT_PUPPETEER_COMMAND_CATALOG_MODE` | `replace` | `replace` albo `extend` |
| `MQTT_PUPPETEER_FILAMENT_CATALOG_PATH` | brak | zewnętrzny katalog typów i metatypów |
| `MQTT_PUPPETEER_FILAMENT_CATALOG_MODE` | `replace` | `replace` albo `extend` |
| `MQTT_PUPPETEER_AMS_UNIT_COUNT` | `1` | liczba urządzeń AMS |
| `MQTT_PUPPETEER_AMS_SLOTS_PER_UNIT` | `4` | liczba slotów w jednym AMS |
| `MQTT_PUPPETEER_EXTERNAL_SPOOL_ENABLED` | `true` | dostępność zewnętrznej szpuli |
| `MQTT_PUPPETEER_OPERATION_TIMEOUT_MS` | `30000` | czas oczekiwania na odpowiedź z tym samym `sequence_id` |

Bez pełnej konfiguracji MQTT aplikacja uruchamia REST i Socket.IO w trybie
offline. Odczyty, katalogi i symulacja ruchu pozostają wtedy dostępne.

## REST

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/service/config` | publiczna konfiguracja bez hasła |
| `GET` | `/service/status` | stan transportu MQTT |
| `GET` | `/service/reports/latest` | ostatni pojedynczy raport |
| `GET` | `/device_config/profile` | profil drukarki i topologia AMS |
| `GET` | `/device_config/state/merged` | pełny stan protokołowy po deep merge |
| `GET` | `/device_config/state/domain` | pełny model domenowy |
| `POST` | `/print_job/pause` | wstrzymanie druku |
| `POST` | `/print_job/resume` | wznowienie druku |
| `POST` | `/print_job/cancel` | anulowanie druku |
| `POST` | `/print_job/speed` | ustawienie trybu prędkości |
| `GET` | `/filament/definitions` | wszystkie scalone definicje |
| `GET` | `/filament/manufacturers/:manufacturer/definitions` | definicje producenta |
| `GET` | `/filament/definitions/:id` | jedna definicja |
| `POST` | `/filament/load` | załadowanie filamentu |
| `POST` | `/filament/unload` | rozładowanie filamentu |
| `POST` | `/filament/define` | przypisanie definicji do slotu |
| `POST` | `/movement/absolute` | ruch XYZ w trybie absolutnym |
| `POST` | `/movement/absolute/simulate` | walidacja i payload bez publikacji |
| `POST` | `/movement/home` | ustawienie pozycji domowej |
| `POST` | `/movement/extrude-relative` | względny ruch ekstrudera |
| `GET` | `/commands` | lista zaimportowanych komend |
| `POST` | `/commands/:id` | wykonanie komendy z katalogu |
| `POST` | `/commands/raw` | jedyny endpoint surowej publikacji |

Operacje publikujące zwracają `202 Accepted`. Symulacja zwraca `200 OK`.
Każda operacja POST otrzymuje `operationId`, który jest zwracany w HTTP,
przenoszony do `sequence_id` i używany w zdarzeniach Socket.IO.

Przykład symulacji:

```http
POST /movement/absolute/simulate
Content-Type: application/json

{ "x": 125, "y": 125, "z": 20 }
```

## Katalog komend

`MQTT_PUPPETEER_COMMAND_CATALOG_PATH` wskazuje tablicę definicji JSON. Tryb `replace`
zastępuje profil A1, a `extend` dodaje lub nadpisuje komendy po `id`.
Endpointy domenowe delegują do identyfikatorów w tym samym katalogu, dlatego
korzystają z identycznej walidacji i budowania payloadu co `/commands/:id`.

## Filamenty i AMS

API zwraca wyłącznie scalone definicje gotowe do użycia. Wewnętrzne listy
`types` i `metaTypes` nie są osobnymi publicznymi modelami odpowiedzi.
Producent jest filtrowany bez rozróżniania wielkości liter.

Stan domenowy AMS nie zawiera surowych obiektów protokołu. Pole `ams` składa
się z `AmsUnitDto`, `AmsSlotDto` i `ExternalSpoolDto`, ze stabilnymi
identyfikatorami, zajętością, aktywnym źródłem, filamentem, kolorem
i temperaturami.

Przykładowe źródło filamentu:

```json
{
  "sourceKind": "ams",
  "amsUnitId": 1,
  "slotId": 2,
  "filamentId": "generic-petg"
}
```

## Socket.IO

Namespace: `/printer`.

Zdarzenia serwer → klient:

- `service.status`;
- `service.report`;
- `device_config.state.merged`;
- `device_config.state.domain`;
- `service.mqtt.publish`;
- `service.operation.result`;
- `service.error`.

Socket.IO jest kanałem wyłącznie odbiorczym. Frontend wykonuje operacje przez
REST, a przez socket otrzymuje raporty urządzenia, aktualizacje modeli, błędy
serwisu oraz status każdej próby publikacji MQTT. Status `published` oznacza
publikację do brokera, a nie wykonanie przez drukarkę. Wynik urządzenia jest
raportowany osobno jako `acknowledged`, `rejected` albo `timed_out`.

## Uruchomienie

```bash
pnpm --filter @cloudless/mqtt-puppeteer start:dev
pnpm --filter @cloudless/mqtt-puppeteer test
pnpm --filter @cloudless/mqtt-puppeteer test:e2e
pnpm --filter @cloudless/mqtt-puppeteer build
```
