# `pre_merge_check`

## Uruchomienie

- `push` do każdej gałęzi poza `release_*` i `deploy_*`;
- `pull_request` do `main` lub `master`;
- ręcznie przez `workflow_dispatch`.

## Cel i kroki

Weryfikuje kod przed scaleniem. Workflow uruchamia reużywalny
`.github/workflows/_job_check.yaml`, który:

1. waliduje `.github/ci/projects.json`;
2. tworzy macierz wszystkich aplikacji;
3. dla każdej aplikacji uruchamia właściwy check Node.js, Python lub Spring
   Boot.

Dla Node.js wykonywany jest skrypt wskazany w `check_script`; pozostałe kroki
kontroli wynikają ze skryptów `.github/steps/check_*.sh`.
