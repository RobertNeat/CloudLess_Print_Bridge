# Zarządzanie zależnościami

Ten dokument opisuje sposób instalowania, aktualizowania i usuwania zależności w repozytorium **CloudLess Print Bridge**.

Repozytorium korzysta z:

- `pnpm` jako menedżera pakietów,
- `pnpm workspace` do zarządzania wieloma aplikacjami,
- jednego głównego pliku `pnpm-lock.yaml`,
- osobnego `package.json` dla każdej aplikacji i biblioteki.

## Struktura workspace

Przykładowa struktura repozytorium:

```text
cloudless-print-bridge/
├── apps/
│   ├── video-service-hub/
│   ├── ftps-remote-manager/
│   ├── mqtt-puppeteer/
│   └── octo-management-dashboard/
├── packages/
│   └── shared-contracts/
├── firmware/
│   └── m5-stack-unitcam-s3/
├── docs/
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

Plik `pnpm-workspace.yaml` powinien zawierać co najmniej:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Firmware nie musi należeć do workspace, jeżeli nie jest projektem Node.js.

## Zasada podstawowa

Zależność należy instalować w tym projekcie, który faktycznie jej używa.

Nie należy dodawać wszystkich bibliotek do głównego `package.json`.

Przykłady:

- klient MQTT należy do `mqtt-puppeteer`,
- biblioteka FTPS należy do `ftps-remote-manager`,
- PrimeNG należy do `octo-management-dashboard`,
- wspólne narzędzia formatowania mogą należeć do głównego workspace.

## Instalacja wszystkich zależności

Po sklonowaniu repozytorium uruchom w katalogu głównym:

```bash
pnpm install
```

Polecenie:

- odczyta wszystkie pliki `package.json` należące do workspace,
- utworzy lub zaktualizuje główny `pnpm-lock.yaml`,
- utworzy strukturę `node_modules` zarządzaną przez pnpm,
- połączy lokalne pakiety workspace.

Nie należy uruchamiać osobnego `pnpm install` w każdym katalogu aplikacji.

## Nazwy pakietów

Każdy projekt powinien mieć jednoznaczną nazwę w swoim `package.json`.

Przykłady:

```json
{
  "name": "@cloudless/video-service-hub",
  "private": true
}
```

```json
{
  "name": "@cloudless/ftps-remote-manager",
  "private": true
}
```

```json
{
  "name": "@cloudless/mqtt-puppeteer",
  "private": true
}
```

```json
{
  "name": "@cloudless/octo-management-dashboard",
  "private": true
}
```

Nazwy te są używane przez opcję `--filter`.

## Instalowanie zależności dla konkretnego projektu

### Video Service Hub

```bash
pnpm --filter @cloudless/video-service-hub add <nazwa-pakietu>
```

Przykład:

```bash
pnpm --filter @cloudless/video-service-hub add @nestjs/swagger
```

Zależność developerska:

```bash
pnpm --filter @cloudless/video-service-hub add -D <nazwa-pakietu>
```

### FTPS Remote Manager

```bash
pnpm --filter @cloudless/ftps-remote-manager add <nazwa-pakietu>
```

Przykład:

```bash
pnpm --filter @cloudless/ftps-remote-manager add basic-ftp
```

### MQTT Puppeteer

```bash
pnpm --filter @cloudless/mqtt-puppeteer add <nazwa-pakietu>
```

Przykład:

```bash
pnpm --filter @cloudless/mqtt-puppeteer add mqtt
```

### Octo Management Dashboard

```bash
pnpm --filter @cloudless/octo-management-dashboard add <nazwa-pakietu>
```

Przykład:

```bash
pnpm --filter @cloudless/octo-management-dashboard add primeng primeicons
```

## Instalowanie zależności w katalogu bieżącego projektu

Można także wejść do katalogu aplikacji:

```bash
cd apps/mqtt-puppeteer
pnpm add mqtt
```

Preferowanym sposobem w dokumentacji i skryptach jest jednak używanie `--filter`, ponieważ polecenie można wtedy wykonać z katalogu głównego.

## Zależności wspólne dla całego repozytorium

Narzędzia używane na poziomie całego workspace instaluje się w głównym `package.json`.

Przykłady:

```bash
pnpm add -Dw prettier
pnpm add -Dw eslint
pnpm add -Dw typescript
```

Znaczenie opcji:

- `-D` — zależność developerska,
- `-w` — instalacja w głównym pakiecie workspace.

Do głównego `package.json` nadają się między innymi:

- Prettier,
- wspólna konfiguracja ESLint,
- narzędzia do uruchamiania wielu aplikacji,
- narzędzia CI,
- narzędzia do kontroli wersji i publikowania pakietów.

Biblioteki runtime powinny pozostać w projektach, które je wykorzystują.

## Usuwanie zależności

```bash
pnpm --filter @cloudless/mqtt-puppeteer remove mqtt
```

Dla zależności głównego workspace:

```bash
pnpm remove -w prettier
```

## Aktualizowanie zależności

Aktualizacja pakietu w jednym projekcie:

```bash
pnpm --filter @cloudless/video-service-hub update @nestjs/swagger
```

Aktualizacja do najnowszej dozwolonej wersji:

```bash
pnpm --filter @cloudless/video-service-hub update @nestjs/swagger --latest
```

Aktualizacja wszystkich projektów:

```bash
pnpm -r update
```

Opcji `--latest` dla całego workspace należy używać ostrożnie, ponieważ może powodować aktualizacje do nowych wersji głównych.

## Uruchamianie poleceń dla jednego projektu

```bash
pnpm --filter @cloudless/video-service-hub start:dev
pnpm --filter @cloudless/ftps-remote-manager test
pnpm --filter @cloudless/mqtt-puppeteer build
pnpm --filter @cloudless/octo-management-dashboard start
```

## Uruchamianie poleceń dla wszystkich projektów

```bash
pnpm -r build
pnpm -r test
pnpm -r lint
```

Opcja `-r` oznacza wykonanie polecenia rekurencyjnie w pakietach workspace.

## Lokalne pakiety workspace

Lokalne biblioteki z katalogu `packages/` należy dodawać przez protokół `workspace:`.

Przykład:

```bash
pnpm --filter @cloudless/video-service-hub   add @cloudless/shared-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/octo-management-dashboard   add @cloudless/shared-contracts@workspace:*
```

W `package.json` pojawi się wpis:

```json
{
  "dependencies": {
    "@cloudless/shared-contracts": "workspace:*"
  }
}
```

Dzięki temu pnpm użyje lokalnego pakietu, a nie pakietu o tej samej nazwie z publicznego rejestru.

## Zasady dla `pnpm-lock.yaml`

Plik `pnpm-lock.yaml`:

- powinien być przechowywany w Git,
- powinien być aktualizowany razem ze zmianami `package.json`,
- nie powinien być ręcznie edytowany,
- powinien istnieć jeden dla całego workspace.

Po zmianie zależności należy commitować razem:

```text
package.json
pnpm-lock.yaml
```

## Czego nie robić

Nie należy:

- uruchamiać `npm install` ani `yarn install`,
- commitować katalogów `node_modules`,
- ręcznie kopiować zależności między projektami,
- dodawać bibliotek runtime wyłącznie do głównego `package.json`,
- używać importów do plików źródłowych innej aplikacji przez ścieżki względne,
- ręcznie edytować `pnpm-lock.yaml`,
- tworzyć osobnych lockfile dla każdej aplikacji.

## Szybka ściąga

```bash
# Instalacja całego workspace
pnpm install

# Pakiet dla jednego projektu
pnpm --filter <nazwa-projektu> add <pakiet>

# Dev dependency dla jednego projektu
pnpm --filter <nazwa-projektu> add -D <pakiet>

# Narzędzie wspólne dla repozytorium
pnpm add -Dw <pakiet>

# Usunięcie pakietu
pnpm --filter <nazwa-projektu> remove <pakiet>

# Build całego workspace
pnpm -r build
```
