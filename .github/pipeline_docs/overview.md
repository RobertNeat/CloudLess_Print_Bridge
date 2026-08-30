# Założenia ogólne

Pipeline GitHub Actions jest niezależną warstwą automatyzacji. Aplikacje
pozostają właścicielem kodu, zależności, testów i komend jakości; pipeline
wywołuje tylko kontrakt opisany w `projects.json`.

Pipeline sprawdza, buduje i wdraża aplikacje znajdujące się w tym repozytorium,
nie zewnętrzne projekty. Działa dla wielu technologii (Node.js/Angular/NestJS,
Python i Spring Boot) i traktuje je jako jeden zestaw współpracujących
kontenerów. Ten sam commit SHA identyfikuje cały zestaw obrazów.

## Ścieżki

- `check` — walidacja konfiguracji, kontrola jakości, testy, budowanie aplikacji,
  SAST i skanowanie zależności/obrazu;
- `build` — budowa obrazu, skan Trivy i zapis obrazu w lokalnym rejestrze pod
  pełnym SHA;
- `deploy` — uruchomienie dokładnie tego zestawu obrazów na produkcji;
- `release` — publikacja obrazów wybranego SHA do GHCR;
- `github_release` — utworzenie wydania o nazwie taga.

Workflowy korzystają z self-hosted runnera. Obrazy są niezmienne, `latest` nie
jest używany, a operacje build/deploy/release są serializowane.
