# octo-management-dashboard

Frontend Angular dla CloudLess Print Bridge. To właściwy interfejs
zarządzania: nie rozmawia bezpośrednio z drukarką, kartą SD ani kamerami —
spina trzy serwisy backendowe (`mqtt-puppeteer`, `ftps-remote-manager`,
`video-service-hub`) w jeden dashboard.

Wersja angielska: [README.md](./README.md).

## Co robi

Aplikacja jest podzielona na trzy sekcje routingu (`src/app/app.routes.ts`),
każda zabezpieczona przez `dashboardAccessGuard`:

- **`/management`** (`src/app/dashboard/`) — sterowanie i monitorowanie
  drukarki. Stan bieżącego zadania druku, temperatury drukarki, wykres
  telemetrii, panel szybkich komend oraz panel ruchu/nawigacji
  (`printer-quick-controls`, `printer-navigation`), a także widget
  podglądu kamery na żywo (`live-preview`). Korzysta z `mqtt-puppeteer`.
- **`/files`** (`src/app/files/`) — przeglądarka plików karty microSD
  drukarki: drzewo katalogów, lista plików, szczegóły pliku oraz strefa
  uploadu. Korzysta z `ftps-remote-manager`.
- **`/videos`** (`src/app/videos/`) — dashboard kamer i wideo: panel kamer,
  podgląd live MJPEG, biblioteka mediów z wyszukiwaniem, odtwarzanie
  (`video-player`, `mp4-player`) oraz okno dialogowe do uruchamiania
  przechwytywania/nagrywania. Korzysta z `video-service-hub`.

Układ `/management` jest zbudowany z widgetów **gridster**
(`angular-gridster2`), dzięki czemu użytkownik może przestawiać, zmieniać
rozmiar i zapisywać układ widgetów
(`src/app/core/dashboard-layout.service.ts`); `/files` ma własną, analogiczną
usługę layoutu.

Integracja z backendem jest ukryta za niewielkimi interfejsami
port/adapter (np. `MANAGEMENT_DASHBOARD_DATA_SOURCE`, `FILES_REPOSITORY`,
`VIDEOS_REPOSITORY` w `src/app/app.config.ts`), dzięki czemu każda sekcja
może w razie potrzeby użyć atrapy danych, gdy prawdziwy backend nie jest
podłączony.

## Uruchomienie

Z katalogu głównego monorepo (zgodnie z konwencją repozytorium):

```bash
pnpm install
pnpm dev:dashboard
```

Albo bezpośrednio przez skrypty tego pakietu
(`apps/octo-management-dashboard/package.json`):

```bash
pnpm --filter @cloudless/octo-management-dashboard start      # ng serve, serwer dev
pnpm --filter @cloudless/octo-management-dashboard build      # ng build
pnpm --filter @cloudless/octo-management-dashboard watch      # ng build --watch (konfiguracja development)
pnpm --filter @cloudless/octo-management-dashboard test       # ng test (Vitest)
pnpm --filter @cloudless/octo-management-dashboard lint       # prettier --check
pnpm --filter @cloudless/octo-management-dashboard typecheck  # ng build --configuration development
pnpm --filter @cloudless/octo-management-dashboard check      # lint + typecheck
```

W tym pakiecie nie ma skryptu `e2e` — nie korzystaj z `ng e2e`, nie jest
tutaj skonfigurowane.

## Komunikacja z backendem

Każdy backend ma własną, niewielką usługę konfiguracyjną w
`src/app/*/backend/` (`MqttPuppeteerConfig`, `FtpsRemoteManagerConfig`,
`VideoServiceHubConfig`), która wyznacza bazowy URL na podstawie
wstrzykiwanej w runtime konfiguracji `window.__CLOUDLESS_AUTH__` (zobacz
`src/app/core/cloudless-auth.config.ts`), z domyślnymi wartościami, gdy nic
nie zostało wstrzyknięte:

| Serwis | Domyślny bazowy URL | Transport |
| --- | --- | --- |
| `mqtt-puppeteer` | `http://localhost:10320` | REST (polling) |
| `ftps-remote-manager` | `http://localhost:10321` | REST |
| `video-service-hub` | `http://localhost:10322` | REST (komendy, telemetria) + strumień MJPEG po HTTP z tokenem dla podglądu live |

Wszystkie żądania wychodzące przechodzą przez wspólny interceptor
`cloudlessAuthInterceptor`, który dokłada nagłówki uwierzytelniające. Na
chwilę obecną frontend **nie** korzysta z Socket.IO — `mqtt-puppeteer`
udostępnia namespace Socket.IO, ale obecna integracja dashboardu odpytuje
REST w trybie polling
(`src/app/dashboard/backend/dashboard-polling.service.ts` wprost opisuje to
jako wybraną strategię tymczasową; `socket.io-client` nie jest jeszcze
zależnością tego pakietu). Podgląd kamery na żywo otwiera zamiast tego
bezpośrednio tokenowany URL strumienia MJPEG w `video-service-hub`
(`GET /api/v1/live/{cameraId}/{requestId}/stream`).

### Proxy serwera dev

`proxy.conf.json` łączy serwer deweloperski Angulara ze wszystkimi trzema
backendami:

| Prefiks ścieżki | Proxy do |
| --- | --- |
| `/api/mqtt` | `http://localhost:10320` (`mqtt-puppeteer`) |
| `/api/ftps` | `http://localhost:10321` (`ftps-remote-manager`) |
| `/api/video` | `http://localhost:10322` (`video-service-hub`) |

Cel proxy dla `video-service-hub` jest zaszyty na sztywno jako port
`10322`. Uruchomienie tego serwisu na innym porcie psuje proxy dla
`/api/video`, dopóki `proxy.conf.json` nie zostanie odpowiednio
zaktualizowany — to znane ograniczenie, którego serwer dev dashboardu nie
wykrywa automatycznie.

## Biblioteka UI

Zbudowany na PrimeNG `21.1.9`, celowo przypiętym — to ostatnia wersja
główna PrimeNG dostępna na licencji open source. Nie podnoś tej zależności
przy rutynowym utrzymaniu; każdą aktualizację PrimeNG traktuj jako świadomą,
osobno rozważaną decyzję, a nie rutynowy bump.

## Powiązane

- [mqtt-puppeteer](../mqtt-puppeteer/README.md)
- [ftps-remote-manager](../ftps-remote-manager/README.md)
- [video-service-hub](../video-service-hub/README.md)
- [printer-contracts](../../packages/printer-contracts/README.md)
