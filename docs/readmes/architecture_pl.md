# Architektura

[English](architecture.md) | Polski

Mapa orientacyjna łącząca serwisy CloudLess Print Bridge. Ten dokument
uzupełnia — a nie zastępuje — README każdej aplikacji oraz głębszą
dokumentację w `apps/mqtt-puppeteer/docs/architecture.md` i
`apps/video-service-hub/docs/service_architecture.md`. Szczegóły wewnętrzne
serwisów znajdują się tam.

## Elementy systemu

System składa się z pięciu elementów oraz jednego zewnętrznego aktora,
wszystkie ograniczone do sieci lokalnej:

| Element | Typ | Rola |
| --- | --- | --- |
| `apps/mqtt-puppeteer` | NestJS | Bridge MQTT/TLS do drukarki; udostępnia REST + Socket.IO |
| `apps/ftps-remote-manager` | NestJS | Bridge FTPS do karty SD drukarki; udostępnia REST |
| `apps/video-service-hub` | NestJS | Hub komend/ingestu/streamingu kamery; rozmawia z firmware kamery i prowadzi własny broker MQTT |
| `apps/octo-management-dashboard` | Angular | UI operatora; korzysta z trzech backendów przez HTTP |
| `packages/printer-contracts` | pakiet TS | Współdzielone, niezależne od transportu DTO modelu drukarki |
| `firmware/m5-stack-unitcam-s3` | firmware ESP32-S3 | Zewnętrzny aktor: urządzenie kamery, z którym rozmawia `video-service-hub` |

## Kto z kim rozmawia

```text
octo-management-dashboard (Angular, :10300)
        |  HTTP (dev: proxy.conf.json /api/mqtt, /api/ftps, /api/video)
        v
+-------------------+   +----------------------+   +--------------------+
| mqtt-puppeteer     |   | ftps-remote-manager  |   | video-service-hub  |
| REST + Socket.IO   |   | REST                 |   | REST + wbudowany MQTT|
| :10320             |   | :10321               |   | :10322 (+ :1883)   |
+---------+---------+   +----------+-----------+   +---------+----------+
          | MQTT/TLS               | FTPS                    | HTTP + MQTT
          v                        v                         v
      Drukarka Bambu Lab A1   Karta SD Bambu Lab A1   M5Stack UnitCam S3
```

- Dashboard łączy się z każdym z trzech backendów zwykłym REST/HTTP. W trybie
  deweloperskim pośredniczy w tym proxy z
  `apps/octo-management-dashboard/proxy.conf.json`
  (`/api/mqtt` → `:10320`, `/api/ftps` → `:10321` z usuniętym prefiksem,
  `/api/video` → `:10322` z usuniętym prefiksem); na produkcji te same trzy
  prefiksy są obsługiwane przez kontener nginx dashboardu. `mqtt-puppeteer`
  dodatkowo udostępnia namespace Socket.IO (`/printer`) jako kanał wyłącznie
  odbiorczy dla zdarzeń raportu/stanu/statusu w czasie rzeczywistym — klient
  HTTP dashboardu i ten kanał socketowy to osobne sprawy, patrz
  `apps/mqtt-puppeteer/docs/endpoints.md`.
- `mqtt-puppeteer` jest jedynym serwisem rozmawiającym z drukarką po
  MQTT/TLS, scalającym jej częściowe raporty i republikującym stabilny model
  domenowy.
- `ftps-remote-manager` jest jedynym serwisem dotykającym karty SD drukarki,
  przez FTPS z przypiętym odciskiem certyfikatu.
- `video-service-hub` to osobna sprawa: steruje firmware kamery ESP32 przez
  HTTP, przyjmuje z niego uploady JPEG/MJPEG/WAV i prowadzi własny broker
  MQTT (wbudowany Aedes albo broker zewnętrzny, jeśli ustawiono
  `VIDEO_SERVICE_HUB_MQTT_URL`) do telemetrii kamer — ten broker MQTT nie ma
  nic wspólnego z brokerem drukarki, z którym łączy się `mqtt-puppeteer`.
- Żaden z trzech backendów nie rozmawia bezpośrednio z pozostałymi. Każdy
  jest właścicielem jednego zewnętrznego protokołu i udostępnia REST (a
  mqtt-puppeteer dodatkowo Socket.IO) w stronę dashboardu.

Dokładne trasy, kształty payloadów i zdarzenia Socket.IO znajdują się w
README i `docs/` każdej aplikacji — ten plik celowo tego nie powtarza.

## Po co istnieje `printer-contracts`

`packages/printer-contracts` (`@cloudless/printer-contracts`) zawiera
niezależne od transportu DTO modelu domenowego drukarki: scalony stan
drukarki (`PrinterDomainModelDto`), model slotów AMS/filamentu
(`AmsUnitDto`, `AmsSlotDto`, `ExternalSpoolDto`), typy ruchu/pozycji
(`MachineEnvelopeDto`, `PrinterPositionDto`), typy żądań komend
(`PrinterCommandId`, `PrinterCommandRequestDto`), wyniki operacji
(`PrinterOperationResultDto`), typy wpisów zdalnego storage'u oraz próbki
telemetrii. Pakiet nie zależy ani od NestJS, ani od MQTT, ani od Socket.IO.

Istnieje jako jedyne źródło prawdy, dzięki czemu:

- `mqtt-puppeteer` (a coraz częściej też `ftps-remote-manager`) mapują swoje
  surowe dane protokołu na jeden współdzielony, stabilny model biznesowy
  zamiast każdy serwis wymyślał własny kształt;
- dashboard (i każdy przyszły konsument) może zaimportować te same typy
  zamiast retypować je na podstawie odpowiedzi REST;
- zmiana protokołu drukarki (inny model drukarki, inny mapper) nigdy nie
  musi przeciekać do frontendu ani kodu międzyserwisowego — zmienia się
  wyłącznie mapper produkujący dany DTO.

Zobacz `packages/printer-contracts/README.md` po listę eksportowanych typów
oraz `packages/README.md` po przegląd katalogu pakietów. Uwaga: pliki
`docs/readmes/shared-objects.md` i `docs/dependency-management.md` w tym repo opisują
wcześniejszą, bardziej ogólną nazwę pakietu (`shared-contracts`) i
przykładowy układ plików sprzed powstania faktycznego pakietu
`printer-contracts` — opis w tym pliku jest tym zgodnym z tym, co istnieje
dzisiaj.

## Zasada "cloudless" / wyłącznie LAN

Każda strzałka na powyższym diagramie pozostaje w sieci lokalnej. Nie ma
przekaźnika chmurowego, konta producenta ani brokera hostowanego w
internecie na krytycznej ścieżce: dashboard, trzy serwisy backendowe,
drukarka i firmware kamery mają siedzieć w tej samej sieci LAN. Każdy serwis
backendowy wprost dokumentuje, że jest projektowany dla zaufanej sieci
lokalnej (patrz sekcje konfiguracji/bezpieczeństwa w README każdej
aplikacji), a wystawienie go poza LAN wymaga dodania uwierzytelniania i
zaostrzenia CORS — to celowa granica zakresu, a nie przeoczenie.

## Gdzie szukać dalej

- `apps/mqtt-puppeteer/README.md`, `apps/mqtt-puppeteer/docs/architecture.md`,
  `apps/mqtt-puppeteer/docs/endpoints.md` — wnętrze bridge'a MQTT i kontrakt REST/Socket.IO.
- `apps/ftps-remote-manager/README.md` — bridge FTPS i API plików.
- `apps/video-service-hub/README.md`,
  `apps/video-service-hub/docs/service_architecture.md`,
  `apps/video-service-hub/docs/rest_endpoints.md` — wnętrze huba kamer.
- `packages/printer-contracts/README.md` — eksportowane DTO.
- `docs/readmes/env_variables_description.md` — pełny opis zmiennych środowiskowych.
- `docs/readmes/operations.md` — konfiguracja CI/CD i wdrożenia tego repozytorium.
- `docs/readmes/development.md` — codzienne komendy deweloperskie.
