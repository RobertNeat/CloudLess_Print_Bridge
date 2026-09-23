# CloudLess Print Bridge

Lokalny system bridge działający wyłącznie w sieci LAN dla drukarki 3D Bambu
Lab A1. Każdy serwis w tym repozytorium łączy się z drukarką, jej kartą
microSD i kamerami przez własną sieć użytkownika — bez konta w chmurze, bez
przekaźnika producenta i bez zależności od internetu w normalnej pracy.

Wersja angielska: [README.md](./README.md).

## Czym to jest

Fabryczny tryb LAN-only Bambu Lab udostępnia MQTT, FTPS i lokalny podgląd
kamery, ale nie daje jednego miejsca do sterowania tym wszystkim. CloudLess
Print Bridge uzupełnia tę lukę zestawem wyspecjalizowanych serwisów, każdy
odpowiedzialny za jeden transport, oraz dashboardem, który je spina:

- **Sterowanie i monitorowanie drukarki** przez własny broker MQTT/TLS
  drukarki.
- **Zarządzanie plikami karty SD** przez serwer FTPS drukarki.
- **Przechwytywanie obrazu z kamer, podgląd live i nagrywanie** przez
  autorski firmware ESP32-S3 rozmawiający z własnym backendem.
- **Jeden dashboard**, prezentujący to wszystko jako spójną powierzchnię
  zarządzania.

## Architektura

| Komponent | Rola |
| --- | --- |
| `apps/octo-management-dashboard` | Frontend Angular — właściwy interfejs użytkownika. Sterowanie i monitorowanie drukarki, przeglądarka plików karty SD oraz dashboard kamer/wideo z podglądem live, złożone z konfigurowalnych widgetów gridster. |
| `apps/mqtt-puppeteer` | Backend NestJS. Łączy się z brokerem MQTT/TLS drukarki, scala częściowe raporty stanu w model domenowy i udostępnia REST + Socket.IO. |
| `apps/ftps-remote-manager` | Backend NestJS. Łączy się z serwerem FTPS drukarki (karta microSD) i udostępnia REST do listowania, pobierania, wysyłania, przenoszenia i usuwania plików. |
| `apps/video-service-hub` | Backend NestJS dla kamer M5Stack UnitCam S3. Przekazuje komendy do firmware kamer, przyjmuje przesyłane JPEG/MJPEG/WAV, rozprowadza live MJPEG do wielu odbiorców oraz prowadzi manifesty nagrań i telemetrię/obecność kamer. |
| `packages/printer-contracts` | Współdzielone, niezależne od transportu kontrakty TypeScript dla modelu domenowego drukarki (jednostki/sloty AMS, zewnętrzna szpula, wyniki operacji), używane przez backendy i dashboard. |
| `firmware/m5-stack-unitcam-s3` | Firmware ESP32-S3 (PlatformIO) dla kamer, implementujący kontrakt przechwytywania/nagrywania/live streamu oczekiwany przez `video-service-hub`. |

Dashboard jest jedynym elementem, który otwiera użytkownik końcowy. Wywołuje
`mqtt-puppeteer` po stan i komendy drukarki, `ftps-remote-manager` po
operacje na plikach oraz `video-service-hub` po sterowanie kamerami i
streaming live/mediów; każdy backend odpowiada dokładnie za jeden transport
do drukarki lub jej peryferiów.

## Struktura repozytorium

- `apps/` — cztery aplikacje opisane wyżej, każda z własnym README.
- `packages/` — współdzielony kod biblioteczny (`printer-contracts`).
- `firmware/` — firmware kamer (projekt PlatformIO, własna para README/README_pl).
- `docs/` — opublikowana wiki GitHub Pages (dokumentacja użytkowa dashboardu);
  bazowa dokumentacja przekrojowa w markdown (architektura, codzienne komendy
  deweloperskie, operacje/CI-CD, pełna lista zmiennych środowiskowych) znajduje
  się w `docs/readmes/`.
- `.github/` — workflowy GitHub Actions, Dockerfile'y (`.github/docker/`), kroki
  i dokumentacja pipeline'u CI. `infrastructure/README.md` opisuje planowaną,
  ale nigdy niezbudowaną strukturę Docker/Compose — rzeczywiste Dockerfile'y i
  plik compose znajdują się w `.github/docker/` i `deploy/`, zobacz
  `docs/readmes/operations.md`.

## Wymagania wstępne

- Node.js zgodny z `pnpm@11.17.0` (przypięte przez `packageManager` w
  głównym `package.json`).
- pnpm `11.17.0` (workspace korzysta z pnpm workspaces; zobacz
  `pnpm-workspace.yaml`).
- Dostęp sieciowy do adresu LAN drukarki, portu MQTT/TLS, portu FTPS i kodu
  dostępu (z ekranu ustawień sieciowych drukarki), a także adresów LAN
  kamer, jeśli uruchamiany jest `video-service-hub`.

## Szybki start

```bash
pnpm install
```

Następnie uruchom potrzebne serwisy, każdy z katalogu głównego repozytorium:

```bash
pnpm dev:mqtt       # mqtt-puppeteer   — sterowanie i monitorowanie drukarki
pnpm dev:ftps       # ftps-remote-manager — zarządzanie plikami karty SD
pnpm dev:video      # video-service-hub   — kamery, podgląd live, nagrywanie
pnpm dev:dashboard  # octo-management-dashboard — interfejs użytkownika
```

Istnieją też skrypty obejmujące cały workspace do budowania/testowania/lintu:

```bash
pnpm build   # pnpm -r build
pnpm test    # pnpm -r test
pnpm lint    # pnpm -r lint
```

Każdy backend wymaga własnej konfiguracji środowiskowej (adres IP drukarki,
dane MQTT/FTPS, porty, ścieżki storage itd.), zanim zacznie działać. Nic z
tego nie jest powielane tutaj — pełną listę zmiennych środowiskowych,
API REST/Socket.IO i uwagi specyficzne dla danego serwisu znajdziesz w
README danej aplikacji:

- [apps/mqtt-puppeteer/README.md](./apps/mqtt-puppeteer/README.md)
- [apps/ftps-remote-manager/README.md](./apps/ftps-remote-manager/README.md)
- [apps/video-service-hub/README.md](./apps/video-service-hub/README.md)
- [apps/octo-management-dashboard/README.md](./apps/octo-management-dashboard/README.md)
- [packages/printer-contracts/README.md](./packages/printer-contracts/README.md)
- [firmware/m5-stack-unitcam-s3/README.md](./firmware/m5-stack-unitcam-s3/README.md)

## Dalsza dokumentacja

Dokumentacja przekrojowa znajduje się w [`docs/readmes/`](./docs/readmes/)
(sam `docs/` to opublikowana wiki GitHub Pages):

- [docs/readmes/architecture.md](./docs/readmes/architecture.md) — jak poszczególne elementy się komunikują.
- [docs/readmes/development.md](./docs/readmes/development.md) — codzienne komendy deweloperskie.
- [docs/readmes/operations.md](./docs/readmes/operations.md) — konfiguracja CI/CD i wdrożenia tego repozytorium.
- [docs/readmes/env_variables_description.md](./docs/readmes/env_variables_description.md) — pełna lista zmiennych środowiskowych.

## Licencja

MIT — zobacz `package.json`.
