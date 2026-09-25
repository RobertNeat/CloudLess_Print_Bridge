# Rozwój

[English](development.md) | Polski

Codzienne komendy pracy w tym monorepo. Szerszy obraz jest w
`docs/readmes/architecture.md`; zmienne środowiskowe są w
`docs/readmes/environment-variables_pl.md` oraz w README każdej aplikacji.

## Wymagania

- Node.js `24` (wersja zadeklarowana per projekt w `.github/ci/projects.json`).
- pnpm `11.17.0` (pole `packageManager` w głównym `package.json`).

## Instalacja

```bash
pnpm install
```

## Uruchomienie serwisu w trybie dev

Skrypty root (z `package.json`), każdy oparty o `pnpm --filter`:

```bash
pnpm dev:mqtt        # @cloudless/mqtt-puppeteer   -> start:dev, :10320
pnpm dev:ftps        # @cloudless/ftps-remote-manager -> start:dev, :10321
pnpm dev:video       # @cloudless/video-service-hub -> start:dev, :10322 (+ MQTT :1883)
pnpm dev:dashboard   # @cloudless/octo-management-dashboard -> start (ng serve), :10300
```

Odpowiednik w formie bezpośredniej:

```bash
pnpm --filter @cloudless/mqtt-puppeteer start:dev
pnpm --filter @cloudless/ftps-remote-manager start:dev
pnpm --filter @cloudless/video-service-hub start:dev
pnpm --filter @cloudless/octo-management-dashboard start
```

Serwer deweloperski dashboardu przekierowuje `/api/mqtt`, `/api/ftps`,
`/api/video` do trzech portów backendów przez
`apps/octo-management-dashboard/proxy.conf.json` — oczekuje backendów na ich
domyślnych portach (10320/10321/10322). Uruchomienie backendu na
niestandardowym porcie psuje to proxy.

## Testy

Per aplikacja, `test` (Jest dla trzech aplikacji NestJS, `ng test`/vitest
dla dashboardu):

```bash
pnpm --filter @cloudless/mqtt-puppeteer test
pnpm --filter @cloudless/ftps-remote-manager test
pnpm --filter @cloudless/video-service-hub test
pnpm --filter @cloudless/octo-management-dashboard test
```

`test:e2e` istnieje wyłącznie w trzech aplikacjach NestJS — `package.json`
dashboardu nie ma skryptu `test:e2e`:

```bash
pnpm --filter @cloudless/mqtt-puppeteer test:e2e
pnpm --filter @cloudless/ftps-remote-manager test:e2e
pnpm --filter @cloudless/video-service-hub test:e2e
```

Dla całego repo:

```bash
pnpm test   # pnpm -r test
```

## Lint / typecheck / check

Każda aplikacja definiuje `check` jako lint + typecheck (patrz każdy
`package.json`):

```bash
pnpm --filter <nazwa-pakietu> lint
pnpm --filter <nazwa-pakietu> typecheck
pnpm --filter <nazwa-pakietu> check
pnpm lint   # pnpm -r lint (skrypt root)
```

**Znany stan bieżący:** `pnpm -r lint` obecnie kończy się błędem.
`video-service-hub` ma wcześniej istniejące błędy ESLint/Prettier związane z
końcami linii CRLF w kilku już zacommitowanych plikach, a
`prettier --check` w `octo-management-dashboard` zgłasza niezgodności
formatowania w około 99 plikach. Oba są problemami wcześniej istniejącymi, a
nie czymś wprowadzonym przez niepowiązaną zmianę — nie oczekuj czystego
`pnpm -r lint` dzisiaj i nie próbuj naprawiać całego zaległego długu jako
efektu ubocznego niepowiązanej zmiany. `pnpm -r lint` obejmuje też wyłącznie
członków workspace, którzy definiują skrypt `lint` (pięć z sześciu
projektów workspace w chwili pisania tego dokumentu); to nie jest gwarancja,
że każdy pakiet został sprawdzony.

## Budowanie

```bash
pnpm --filter <nazwa-pakietu> build
pnpm build   # pnpm -r build (skrypt root)
```

## Przybliżenie CI lokalnie

`.github/workflows/pre_merge_check.yaml` uruchamia job `check`
(`.github/workflows/_job_check.yaml`) przy każdym push/PR. Jego krok per
projekt to `.github/steps/check_node.sh`, który dla każdego zadeklarowanego
projektu:

1. instaluje przypiętą wersję Node przez `mise`;
2. uruchamia `pnpm install --frozen-lockfile` i buduje zależności workspace;
3. uruchamia `check_script` projektu (czyli `pnpm run check`);
4. uruchamia `trivy fs` (skan podatności zależności) oraz `semgrep scan` (SAST).

Krok 3 można odtworzyć lokalnie przez `pnpm --filter <nazwa-pakietu> check`.
Kroki 1, 2 i 4 wymagają lokalnie zainstalowanych `mise`, `trivy` i `semgrep`,
by w pełni odtworzyć działanie CI — samo `pnpm run check` jest dobrym
przybliżeniem bramek jakości kodu, ale nie pełnym zastępnikiem skanowania
zależności/SAST wykonywanego przez job CI.

Aby zwalidować sam plik `.github/ci/projects.json` (plik deklarujący, jakie
aplikacje istnieją, ich porty, obrazy i Dockerfile'e) przed jego zmianą:

```bash
bash .github/steps/validate_projects.sh .github/ci/projects.json
```

Wymaga `jq` i sprawdza między innymi, że każdy katalog pod `apps/` jest
zadeklarowany dokładnie raz.

## Zmienne środowiskowe

Skopiuj `.env.example` z głównego katalogu repo do `.env` i uzupełnij dane
drukarki/kamery. Pełny opis zmiennych (uwierzytelnianie, zmienne per serwis,
zasady interpolacji `${VAR}`) jest w `docs/readmes/environment-variables_pl.md`,
albo w README każdej aplikacji dla zmiennych tego serwisu z osobna. Aby
uruchomić to repo z opublikowanych obrazów GHCR zamiast lokalnego
środowiska deweloperskiego, zobacz `docs/readmes/running-ghcr-images_pl.md`.

## Powiązane dokumenty

- `docs/readmes/architecture.md` — mapa architektury międzyserwisowej.
- `docs/readmes/operations.md` — konfiguracja CI/CD i wdrożenia tego repozytorium.
- `docs/readmes/environment-variables_pl.md` — pełny opis zmiennych środowiskowych.
- `docs/readmes/running-ghcr-images_pl.md` — uruchamianie opublikowanych obrazów z GHCR z własnym `.env`.
