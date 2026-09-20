# Operacje

[English](operations.md) | Polski

Konkretna konfiguracja CI/CD i wdrożenia tego repozytorium. Ogólny opis
działania samego produktu pipeline (jest projektowany jako przenośny —
patrz `.github/pipeline_docs/overview.md`, który wprost mówi, że można
skopiować `.github` do innego repozytorium) znajduje się w
`.github/pipeline_docs/`. Ten plik dokumentuje wyłącznie *instancję tego
pipeline'u w tym repozytorium*: jakie projekty są zadeklarowane, na jakich
portach, jakimi Dockerfile'ami budowane, gdzie wdrażane.

## Zadeklarowane projekty (`.github/ci/projects.json`)

| Projekt | Framework | Ścieżka | Port host | Port kontenera |
| --- | --- | --- | --- | --- |
| `mqtt-puppeteer` | nestjs | `apps/mqtt-puppeteer` | 10320 | 10320 |
| `ftps-remote-manager` | nestjs | `apps/ftps-remote-manager` | 10321 | 10321 |
| `video-service-hub` | nestjs | `apps/video-service-hub` | 10322 | 10322 |
| `octo-management-dashboard` | angular | `apps/octo-management-dashboard` | 10300 | 10300 |

Wszystkie cztery używają `check_script: "check"`. Trzy aplikacje NestJS
budują się `.github/docker/node.Dockerfile` i startują przez
`start_command: "node dist/main.js"` (`build_output: "dist"`). Dashboard
buduje się `.github/docker/angular.Dockerfile` i nie ma `start_command` —
serwuje swój statyczny build
(`apps/octo-management-dashboard/dist/octo-management-dashboard/browser`)
przez nginx, skonfigurowany przez
`server_config: "apps/octo-management-dashboard/nginx.conf"`. Port
wbudowanego brokera MQTT `video-service-hub` (`1883`) nie jest częścią
kontraktu portów z `projects.json` — jest publikowany osobno w
`deploy/compose.yml`.

## Dockerfile'e

- `.github/docker/node.Dockerfile` — build dwuetapowy. Etap 1 instaluje cały
  workspace przez `pnpm install --frozen-lockfile`, buduje docelowy pakiet i
  jego zależności workspace (`pnpm --filter "<pkg>..." build`), a następnie
  składa produkcyjny `node_modules` przez `pnpm deploy --prod`. Etap 2
  kopiuje ten zdeployowany katalog wraz z zbudowanym `dist/` do świeżego
  obrazu `node:${RUNTIME_VERSION}-alpine`, uruchamia jako niewymagający
  roota użytkownik `node` i wykonuje `${START_COMMAND}`.
- `.github/docker/angular.Dockerfile` — build dwuetapowy. Etap 1 instaluje
  workspace i uruchamia `ng build` docelowego pakietu. Etap 2 kopiuje
  statyczny build do obrazu `nginx:1.29-alpine` razem z `nginx.conf`
  aplikacji oraz szablonem/skryptem renderującym konfigurację uwierzytelniania
  w runtime (`cloudless-auth.runtime.js.template`, `render-auth-runtime.sh`).

Oba Dockerfile'e zostały potwierdzone jako istniejące pod powyższymi
ścieżkami.

## Cel wdrożenia (blok `deploy` z `projects.json`)

| Pole | Wartość |
| --- | --- |
| `environment` | `production` |
| `host` | `192.168.1.160` |
| `user` | `docker_deploy` |
| `registry` | `192.168.1.162:5000` |
| `compose_file` | `deploy/compose.yml` |
| `config_file` | `.env.example` |
| `remote_dir` | `/home/docker_deploy/cloudless-print-bridge` |

To adresy sieci lokalnej i niesekretne współrzędne wdrożenia zacommitowane
w repo, a nie dane uwierzytelniające.

## `deploy/compose.yml`

Potwierdzone jako istniejący plik. Składa cztery powyższe serwisy w jeden
projekt Compose (`cloudless-print-bridge`):

- `image` każdego serwisu jest szablonowany z `${REGISTRY}`/`${IMAGE_TAG}`,
  dzięki czemu ten sam commit SHA identyfikuje cały zestaw obrazów;
- `mqtt-puppeteer` i `video-service-hub` mają healthchecki HTTP
  (`/api/mqtt/health`, `/health`); `ftps-remote-manager` na razie żadnego
  nie ma;
- `video-service-hub` dodatkowo publikuje `1883:1883` dla swojego
  wbudowanego brokera MQTT i montuje nazwany wolumen
  (`video-service-hub-data`) pod `/data` dla trwałego storage'u;
- `octo-management-dashboard` czeka aż `mqtt-puppeteer` i `video-service-hub`
  osiągną `service_healthy` (nie tylko "started") zanim wystartuje, a na
  `ftps-remote-manager` czeka wyłącznie do `service_started` — to unika
  wyścigu nginx "host not found in upstream", ponieważ `ftps-remote-manager`
  nie ma jeszcze endpointu health, na który mógłby czekać;
- współdzielone zmienne `CLOUDLESS_AUTH_*` konfigurują identyczny tryb
  uwierzytelniania międzyserwisowego na wszystkich trzech backendach i na
  dashboardzie.

## Rozbieżność w `infrastructure/`

`infrastructure/README.md` opisuje planowany układ
(`infrastructure/docker/*.Dockerfile`, `infrastructure/compose/docker-compose.yml`,
`infrastructure/proxy/nginx.conf`, `infrastructure/env/.env.example`), który
nigdy nie został faktycznie zbudowany — katalog zawiera obecnie wyłącznie
ten plik README. Prawdziwe Dockerfile'e znajdują się pod `.github/docker/`,
a prawdziwy plik compose to `deploy/compose.yml`; jeśli otworzysz
`infrastructure/` oczekując tych plików, jeszcze ich tam nie ma.

## Etapy pipeline'u w skrócie

Pełny opis jest w `.github/pipeline_docs/overview.md`. To repozytorium
uruchamia wszystkie pięć etapów:

- **check** — waliduje `projects.json`, uruchamia `check_script` każdego
  projektu, buduje go oraz uruchamia Trivy (skan zależności) i Semgrep
  (SAST). Podpięty do `.github/workflows/pre_merge_check.yaml` przy każdym
  push/PR.
- **build** — buduje obraz Docker każdego projektu, skanuje go Trivy i
  zapisuje w lokalnym rejestrze pod pełnym SHA commita.
- **deploy** — uruchamia dokładnie ten zestaw obrazów na hoście
  produkcyjnym przez `deploy_compose_ssh.sh`.
- **release** — republikuje obrazy wybranego SHA do GHCR pod tagiem wersji.
- **github_release** — tworzy wydanie GitHub o nazwie tego taga.

## Skrypty `.github/steps/*.sh` (te dotyczące Node)

- `check_node.sh` — krok `check` per projekt: instaluje przypiętą wersję
  Node przez `mise`, `pnpm install --frozen-lockfile`, buduje zależności
  workspace, uruchamia `check_script` projektu, a następnie `trivy fs` i
  `semgrep scan`.
- `validate_projects.sh` — waliduje kształt samego `projects.json` (schemat,
  wymagane pola deploy, spójność pól per projekt, unikalność
  nazw/ścieżek/obrazów/portów) i sprawdza krzyżowo, że każdy katalog pod
  każdym wpisem `pipeline.project_roots` (czyli `apps/`) jest zadeklarowany
  dokładnie raz.
- `create_docker_image.sh` — buduje obraz Docker jednego projektu, tagowany
  `${REGISTRY}/${IMAGE}:${SHA}` (pomijając build, jeśli ten niezmienny tag
  już istnieje zdalnie), używając zadeklarowanego Dockerfile'a projektu i
  argumentów budowania.
- `scan_docker_image.sh` — uruchamia `trivy image` na zbudowanym obrazie,
  opcjonalnie odfiltrowując podatności dopasowane do listy
  `Trivy_exceptions` projektu przed przerwaniem builda.
- `push_image_ghcr.sh` — przetagowuje wskazany lokalny obraz po SHA na
  `ghcr.io/<owner>/<image>:<wersja>` i wypycha go, odmawiając nadpisania
  istniejącego taga wydania wskazującego na inny digest.
- `push_local_image.sh` — wypycha obraz do lokalnego rejestru pod tagiem
  SHA, odmawiając cichego nadpisania istniejącego niezmiennego taga inną
  zawartością.
- `deploy_compose_ssh.sh` — kopiuje `compose.yml` oraz wygenerowany
  `projects.env` (nazwy obrazów + porty per projekt) na zdalny host przez
  SSH/SCP, instaluje `.env.example` jako zdalny `config.env` tylko jeśli
  jeszcze go tam nie ma, a następnie uruchamia
  `docker compose ... pull` i `up -d --remove-orphans`.
- `cleanup_runner_images.sh` — na self-hosted runnerze usuwa starsze lokalne
  obrazy dla nazwy obrazu każdego zadeklarowanego projektu, zachowując
  wyłącznie tag bieżącego SHA (albo najnowszy, jeśli bieżącego SHA nie ma),
  a na końcu wypisuje `docker system df`.

## Powiązane dokumenty

- `.github/pipeline_docs/overview.md`, `pipeline_guidelines.md`,
  `pre_merge_check.md`, `production_deployment.md`, `release_ghcr.md` —
  przenośny, niezależny od repozytorium opis działania produktu pipeline.
- `docs/architecture.md` — mapa architektury międzyserwisowej.
- `docs/development.md` — codzienne komendy deweloperskie.
