# mqtt-puppeteer

Lokalny bridge NestJS do drukarki 3D. Aplikacja łączy się z brokerem drukarki
przez MQTT/TLS, scala częściowe raporty do kompletnego stanu procesu oraz
udostępnia REST i Socket.IO dla innych aplikacji.

Projekt zawiera wymienny profil komend BambuLab A1 oraz niezależne od
transportu kontrakty używane przez backend i przyszły frontend.

Szczegółowa dokumentacja:

- [wszystkie endpointy REST i zdarzenia Socket.IO](./docs/endpoints.md);
- [architektura i przepływy danych](./docs/architecture.md).

## Granice modułów

- `mqtt-transport` zna wyłącznie MQTT: połączenie, topics, raporty i publikację.
- `printer-state` zna wyłącznie JSON raportu, deep merge i model domenowy.
- `commands` buduje payloady z wymiennego katalogu i przekazuje je do transportu.
- `realtime` jest adapterem Socket.IO nad publicznymi zdarzeniami aplikacji.
- `events` rozdziela producentów i konsumentów zdarzeń przez RxJS.

Socket.IO nie jest połączeniem do drukarki. Drukarka komunikuje się z bridge'em
przez MQTT, a Socket.IO służy klientom bridge'a (np. frontendowi).

## Konfiguracja

Minimalny `.env` w katalogu głównym monorepo:

```env
MQTT_HOST=192.168.1.103
MQTT_PORT=8883
MQTT_USERNAME=bblp
BAMBU_MQTT_PASSWORD=your_lan_access_code
PRINTER_SN=03919D581204433
PORT=3000
```

Topics domyślnie mają postać `device/${PRINTER_SN}/report` i
`device/${PRINTER_SN}/request`. Można je zastąpić przez `MQTT_REPORT_TOPIC` i
`MQTT_COMMAND_TOPIC`, dzięki czemu transport nie jest przywiązany do BambuLab.

Pozostałe opcje:

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | host HTTP |
| `MQTT_REJECT_UNAUTHORIZED` | `false` | weryfikacja certyfikatu TLS |
| `MQTT_CONNECT_TIMEOUT_MS` | `10000` | timeout połączenia |
| `MQTT_RECONNECT_PERIOD_MS` | `4000` | odstęp reconnect |
| `MQTT_KEEPALIVE_SECONDS` | `60` | keepalive MQTT |
| `PRINTER_STATE_TEMPLATE_PATH` | brak | opcjonalny początkowy obiekt JSON |
| `COMMAND_CATALOG_PATH` | brak | zewnętrzny katalog komend JSON |
| `COMMAND_CATALOG_MODE` | `replace` | `replace` albo `extend` |
| `FILAMENT_CATALOG_PATH` | brak | zewnętrzny katalog typów i metatypów |
| `FILAMENT_CATALOG_MODE` | `replace` | `replace` albo `extend` |
| `AMS_UNIT_COUNT` | `1` | liczba urządzeń AMS |
| `AMS_SLOTS_PER_UNIT` | `4` | liczba slotów w jednym AMS |
| `EXTERNAL_SPOOL_ENABLED` | `true` | dostępność zewnętrznej szpuli |

Bez pełnej konfiguracji MQTT aplikacja uruchamia REST i Socket.IO w trybie
offline. Umożliwia to przeglądanie i podgląd komend bez przypadkowej publikacji.

## REST

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/mqtt/config` | konfiguracja publiczna bez hasła |
| `GET` | `/mqtt/status` | status połączenia |
| `GET` | `/mqtt/reports/latest` | ostatni pojedynczy raport |
| `POST` | `/mqtt/commands/raw` | publikacja surowego obiektu JSON |
| `POST` | `/mqtt/command` | publikacja komendy JSON do drukarki |
| `POST` | `/mqtt/request` | publikacja requestu JSON do drukarki |
| `GET` | `/printer/state` | raw, domain i czas aktualizacji |
| `GET` | `/printer/state/raw` | pełny stan po deep merge |
| `GET` | `/printer/state/domain` | model domenowy |
| `GET` | `/json_model` | pełny stan protokołowy po deep merge |
| `GET` | `/domain_model` | model biznesowy drukarki |
| `GET` | `/commands` | aktywny katalog komend |
| `GET` | `/commands/profile` | profil drukarki i topologia filamentów |
| `POST` | `/commands/:id/preview` | renderowanie bez publikacji |
| `POST` | `/commands/:id` | renderowanie i publikacja (`202`) |
| `GET` | `/filaments` | rozwiązane definicje filamentów |
| `GET` | `/filaments/catalog` | typy, metatypy i wynikowe definicje |
| `GET` | `/filaments/:id` | jedna wynikowa definicja |

Przykład:

```http
POST /commands/move-absolute/preview
Content-Type: application/json

{ "x": 125, "y": 125, "z": 20 }
```

## Wymiana katalogu komend

`COMMAND_CATALOG_PATH` wskazuje plik zawierający tablicę definicji. Tryb
`replace` całkowicie zastępuje profil A1, a `extend` dodaje lub nadpisuje
komendy po `id`. Placeholder obejmujący całą wartość zachowuje typ parametru;
placeholder będący fragmentem stringa jest interpolowany jako tekst.

```json
[
  {
    "id": "fetch-status",
    "description": "Status command for another printer",
    "parameters": {
      "requestId": {
        "type": "string",
        "required": true
      }
    },
    "payload": {
      "status": {
        "command": "fetch",
        "request_id": "{{requestId}}"
      }
    }
  }
]
```

Definicje parametrów obsługują `type` (`number`, `string`, `boolean`),
`required`, `default`, `minimum`, `maximum`, `integer`, `values`, `pattern`
i `description`. Nieznane parametry są odrzucane. Dla drukarki o zupełnie innym raporcie należy także
podmienić provider `PRINTER_DOMAIN_MAPPER`; logika stanu i transport pozostają
bez zmian.

## Filamenty i topologia AMS

Frontend posługuje się stabilnym modelem źródła filamentu:

```json
{
  "sourceKind": "ams",
  "amsUnitId": 1,
  "slotId": 2,
  "filamentId": "generic-petg"
}
```

Profil drukarki mapuje tę lokalizację na własne identyfikatory protokołu.
Topologia nie zakłada jednego AMS: liczba urządzeń i slotów jest
konfigurowalna, a szpula zewnętrzna jest osobnym rodzajem źródła.

Definicje filamentów składają się z:

- typu materiału (`tray_type`, kolor domyślny i temperatury);
- metatypu marki (`filamentBrand`, `tray_info_idx` i opcjonalne nadpisania);
- rozwiązanej definicji używanej przez komendę `set-filament`.

Wbudowane definicje znajdują się w kodzie projektu. Aplikacja nie czyta
`MQTT_WIKI` w runtime. Cały katalog można zastąpić lub rozszerzyć przez
`FILAMENT_CATALOG_PATH`.

## Socket.IO

Namespace: `/printer`.

Zdarzenia serwer → klient:

- `mqtt.status`
- `mqtt.report` (pojedynczy raport)
- `printer.state.raw` (pełny deep merge)
- `printer.state.domain`
- `printer.command.accepted`
- `exception`

Zdarzenia klient → serwer:

- `printer.command`: `{ "id": "set-light", "parameters": { "enabled": true } }`
- `mqtt.command.raw`: dowolny obiekt JSON

Potwierdzenie `printer.command.accepted` oznacza udaną publikację MQTT, nie
wykonanie komendy przez drukarkę. Akceptację/odpowiedź urządzenia należy
interpretować z `mqtt.report` lub z kolejnego stanu.

## Stan

Stan zaczyna się od `{}` albo od pliku `PRINTER_STATE_TEMPLATE_PATH`. Każdy
raport będący obiektem jest scalany rekurencyjnie:

- obiekty są scalane,
- tablice i skalary są zastępowane,
- brakujące pola są zachowywane,
- klucze `__proto__`, `constructor` i `prototype` są ignorowane.

Po każdej aktualizacji mapper A1 tworzy model domenowy. Odczyty zwracają kopie,
więc klient nie może zmienić stanu przechowywanego w procesie.

## Uruchomienie

```bash
pnpm --filter @cloudless/mqtt-puppeteer start:dev
pnpm --filter @cloudless/mqtt-puppeteer test
pnpm --filter @cloudless/mqtt-puppeteer test:e2e
pnpm --filter @cloudless/mqtt-puppeteer build
```
