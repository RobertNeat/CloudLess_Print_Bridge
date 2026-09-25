# Uruchamianie opublikowanych obrazów z GHCR

Polski | [English](running-ghcr-images.md)

Jak uruchomić ten projekt na podstawie opublikowanych obrazów kontenerów, bez
klonowania repozytorium i bez niczego budowania lokalnie. To odpowiednik
`docs/readmes/operations.md` dla użytkownika końcowego — `operations.md`
opisuje własny, zautomatyzowany pipeline wdrożeniowy tego repo
(`deploy_compose_ssh.sh`, SSH, host produkcyjny `192.168.1.160`) — ten plik
zakłada brak tego dostępu i zaczyna od punktu "wykonałem `docker pull`".

## Skąd biorą się obrazy

`.github/workflows/release_ghcr.yaml` publikuje obrazy, gdy zostanie
wypchnięty tag Git w formacie `release_X.Y.Z` (albo gdy zostanie opublikowany
GitHub Release, albo workflow zostanie odpalony ręcznie na istniejącym tagu).
Dla każdego projektu zadeklarowanego w `.github/ci/projects.json` publikuje:

```text
ghcr.io/robertneat/cloudless-print-bridge/<image>:X.Y.Z
```

Dla czterech projektów tego repo są to poniższe obrazy — polecenia pobrania
poniżej celują w wersję `1.0.0`; dla kolejnego release'u zamień `1.0.0` na
wersję tego release'u (część po `release_` w jego tagu Git, np. tag
`release_1.3.0` → `1.3.0`):

```bash
docker pull ghcr.io/robertneat/cloudless-print-bridge/mqtt-puppeteer:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/ftps-remote-manager:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/video-service-hub:1.0.0
docker pull ghcr.io/robertneat/cloudless-print-bridge/octo-management-dashboard:1.0.0
```

GitHub Release utworzony dla danego tagu zawiera dokładne odwołania do
obrazów dla tej wersji — zobacz zakładkę
[Releases](../../../../releases) repozytorium albo `git tag -l "release_*"`
dla dostępnych wersji.

## Czego potrzebujesz

- Docker z Compose v2 (`docker compose`, nie samodzielny `docker-compose`).
- Plik `deploy/compose.yml` z repozytorium — nie potrzebujesz reszty repo,
  tylko ten jeden plik. Pobierz go bezpośrednio z tagu, który wdrażasz, np.
  z interfejsu GitHub pod ścieżką `deploy/compose.yml` na tagu
  `release_X.Y.Z`, albo przez `git archive`/`curl` na surowy URL pliku dla
  tego tagu.
- Plik `.env.example` z repozytorium (ten sam tag) jako punkt wyjścia do
  konfiguracji.

## Krok 1 — zbuduj swój `.env`

Skopiuj `.env.example` do `.env` i uzupełnij dane swojej drukarki/kamer
(adres IP drukarki, kod dostępu MQTT/FTPS, adresy kamer itd.) — zobacz
[environment-variables_pl.md](./environment-variables_pl.md), aby poznać
znaczenie każdej zmiennej.

`.env.example` obejmuje konfigurację na poziomie aplikacji (uwierzytelnianie,
dane połączenia z drukarką/kamerami, limity rozmiarów). **Nie** obejmuje
zmiennych, których `deploy/compose.yml` potrzebuje, by wybrać *które obrazy*
uruchomić i *na jakich portach* je udostępnić:

```text
REGISTRY, IMAGE_TAG
MQTT_PUPPETEER_IMAGE,               oraz odpowiedniki dla ftps-remote-manager / video-service-hub / octo-management-dashboard
MQTT_PUPPETEER_HOST_PORT, MQTT_PUPPETEER_CONTAINER_PORT,   oraz taka sama para dla pozostałych trzech usług
```

We własnym pipelinie CI/CD tego repo te zmienne są generowane automatycznie
z `.github/ci/projects.json` przez `.github/steps/deploy_compose_ssh.sh` do
osobnego pliku `projects.env` — zobacz `docs/readmes/operations.md`.
Uruchamiając z pobranego release'u GHCR nie masz tej automatyzacji, więc
dopisz te zmienne do swojego `.env` ręcznie. Dodaj poniższy blok (dostosuj
wartości do potrzeb — pokazane porty to domyślne wartości tego repo):

```env
# Wybór obrazów
REGISTRY=ghcr.io/robertneat/cloudless-print-bridge
IMAGE_TAG=1.0.0

MQTT_PUPPETEER_IMAGE=mqtt-puppeteer
FTPS_REMOTE_MANAGER_IMAGE=ftps-remote-manager
VIDEO_SERVICE_HUB_IMAGE=video-service-hub
OCTO_MANAGEMENT_DASHBOARD_IMAGE=octo-management-dashboard

# Porty hosta/kontenera
MQTT_PUPPETEER_HOST_PORT=10320
MQTT_PUPPETEER_CONTAINER_PORT=10320
FTPS_REMOTE_MANAGER_HOST_PORT=10321
FTPS_REMOTE_MANAGER_CONTAINER_PORT=10321
VIDEO_SERVICE_HUB_HOST_PORT=10322
VIDEO_SERVICE_HUB_CONTAINER_PORT=10322
OCTO_MANAGEMENT_DASHBOARD_HOST_PORT=10300
OCTO_MANAGEMENT_DASHBOARD_CONTAINER_PORT=10300
```

`IMAGE_TAG=1.0.0` celuje w tag `release_1.0.0`. Dla kolejnego release'u
zamień `1.0.0` na wersję tego release'u we wszystkich miejscach powyżej
(część po `release_` w jego tagu Git, np. tag `release_1.3.0` →
`IMAGE_TAG=1.3.0`).

## Krok 2 — uruchomienie na innym porcie

Ponieważ `*_HOST_PORT` to twoja własna zmienna, a nie coś zaszytego w
obrazie, możesz ją dowolnie zmienić. Na przykład, aby uruchomić dashboard na
porcie `8080` zamiast domyślnego `10300`, wystarczy zmienić:

```env
OCTO_MANAGEMENT_DASHBOARD_HOST_PORT=8080
```

`*_CONTAINER_PORT` to port, na którym aplikacja nasłuchuje *wewnątrz*
kontenera — zostaw go na wartości domyślnej, chyba że dodatkowo nadpisujesz
własną zmienną aplikacji `*_PORT` (zobacz `environment-variables.md`), by
nasłuchiwała gdzie indziej wewnętrznie. Zmiana samego `HOST_PORT` (lewa
strona mapowania Compose `"${HOST_PORT}:${CONTAINER_PORT}"`) wystarczy, aby
"udostępnić tę usługę na innym porcie lokalnym".

Zwróć uwagę, że `video-service-hub` zawsze dodatkowo publikuje `1883:1883`
(swój wbudowany broker MQTT dla kamer) — to mapowanie jest na stałe w
`compose.yml`, nie jest sterowane zmienną.

## Krok 3 — uruchomienie stosu

Z katalogu zawierającego twój `.env` i pobrany `compose.yml`:

```bash
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
```

To pobiera cztery obrazy w wersji `${IMAGE_TAG}` z `${REGISTRY}` i uruchamia
je razem jako jeden projekt Compose, połączone tak samo jak w produkcji:
dashboard czeka, aż `mqtt-puppeteer` i `video-service-hub` zgłoszą stan
zdrowy, zanim wystartuje, `video-service-hub` dostaje trwały nazwany wolumen
na nagrania, a wszystkie cztery usługi współdzielą zmienne `CLOUDLESS_AUTH_*`
z twojego `.env`.

Status i logi sprawdzaj standardowo poleceniami Compose:

```bash
docker compose --env-file .env -f compose.yml ps
docker compose --env-file .env -f compose.yml logs -f
```

Otwórz dashboard pod adresem
`http://<host>:<OCTO_MANAGEMENT_DASHBOARD_HOST_PORT>/`.

## Aktualizacja do nowego release'u

Zmień `IMAGE_TAG` w swoim `.env` na nową wersję, a następnie powtórz krok 3
(`pull`, a potem `up -d`) — Compose odtworzy tylko te kontenery, których
obraz faktycznie się zmienił.

## Powiązane dokumenty

- [environment-variables_pl.md](./environment-variables_pl.md) — pełna referencja każdej zmiennej na poziomie aplikacji z `.env.example`.
- [operations_pl.md](./operations_pl.md) — własny pipeline CI/CD tego repo i zautomatyzowany deploy produkcyjny (źródło wzorca `projects.json` → `projects.env` przywołanego powyżej).
- [architecture_pl.md](./architecture_pl.md) — co robi każda usługa i jak się ze sobą komunikują.
