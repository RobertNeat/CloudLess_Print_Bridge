# `production_deployment`

## Uruchomienie

- automatycznie po `push` do `main` lub `master`;
- ręcznie przez `workflow_dispatch`, opcjonalnie z pełnym `sha`.

## Cel i kroki

Zapewnia, że na produkcji działa kompletny zestaw aplikacji z jednego commita.
Kroki są wykonywane sekwencyjnie:

1. `context` wybiera i normalizuje pełny SHA;
2. `check` sprawdza wszystkie aplikacje;
3. `build` buduje, skanuje Trivy i publikuje obrazy pod SHA do rejestru
   lokalnego;
4. `deploy` kopiuje Compose/config przez SSH i uruchamia zestaw obrazów o tym
   samym SHA.

## Konfiguracja produkcyjna

Plik `config.env` w katalogu `remote_dir` jest trwałą konfiguracją produkcji.
Przy pierwszym wdrożeniu, jeśli zdalny plik nie istnieje, pipeline kopiuje do
niego plik wskazany przez `deploy.config_file`. Przy kolejnych wdrożeniach
istniejący zdalny `config.env` pozostaje bez zmian i jest używany przez Docker
Compose.
(plik docker_deploy/cloudless-print-bridge/config.env)

Adres hosta, użytkownik, rejestr, pliki i katalog zdalny są w sekcji `deploy`
pliku [`../ci/projects.json`](../ci/projects.json).

## `projects.env`

`deploy/compose.yml` nie zawiera nazw obrazów ani portów na stałe — odwołuje
się do zmiennych `<PROJECT>_IMAGE`, `<PROJECT>_HOST_PORT` i
`<PROJECT>_CONTAINER_PORT`. Plik `deploy_compose_ssh.sh` generuje je z
`projects.json` do `projects.env` i kopiuje na hosta obok `config.env`;
`docker compose` musi być zawsze wywoływany z obydwoma plikami
(`--env-file config.env --env-file projects.env`), inaczej obrazy i porty
pozostaną nierozwiązane.

Porty kontenerów backendów (`10220`/`10221`/`10222`) są też zaszyte na stałe w
[`apps/octo-management-dashboard/nginx.conf`](../../apps/octo-management-dashboard/nginx.conf)
w sekcjach `proxy_pass`. Zmiana `ports.container` danego backendu w
`projects.json` nie jest tam odzwierciedlana automatycznie — `nginx.conf`
trzeba zaktualizować ręcznie w tym samym commicie.
