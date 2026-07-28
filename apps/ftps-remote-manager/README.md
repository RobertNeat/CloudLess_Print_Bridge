# ftps-remote-manager

Lokalny serwis NestJS pośredniczący w dostępie do karty microSD drukarki
Bambu Lab A1 pracującej w trybie LAN-only. Serwis łączy się z drukarką przez
FTPS, weryfikuje przypięty odcisk certyfikatu i udostępnia API REST do
listowania, pobierania, wysyłania, przenoszenia i usuwania plików oraz
katalogów.

## Architektura

Kod jest pogrupowany według odpowiedzialności:

| Katalog | Odpowiedzialność |
| --- | --- |
| `src/config` | walidowana konfiguracja HTTP, FTPS i limitów uploadu |
| `src/ftps` | transport `basic-ftp`, sesje i zachowania specyficzne dla A1 |
| `src/remote-files` | ścieżki zdalne, przypadki użycia, mapowanie i REST |
| `packages/printer-contracts` | kontrakty DTO współdzielone z frontendem |

Każda operacja korzysta z osobnej, zawsze zamykanej sesji. Warstwa przypadków
użycia nie zależy od `basic-ftp`, dzięki czemu można ją testować bez połączenia
z drukarką, a w przyszłości zastąpić transport bez zmiany API.

## Konfiguracja

Uruchomienie przez skrypty workspace odbywa się z katalogu głównego monorepo.
Skopiuj wartości z `apps/ftps-remote-manager/.env.example` do głównego pliku
`.env` i uzupełnij dane odczytane z drukarki.

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | interfejs HTTP |
| `PORT` | `3000` | port HTTP |
| `FTP_HOST` | wymagane | adres IP drukarki |
| `FTP_PORT` | `990` | port FTPS |
| `FTP_USER` | wymagane (`bblp` dla A1) | użytkownik FTPS |
| `FTP_PASSWORD` | wymagane | kod dostępu LAN drukarki |
| `FTP_TLS_MODE` | `implicit` | `implicit` albo `explicit` |
| `FTP_TLS_FINGERPRINT256` | wymagane | SHA-256 certyfikatu drukarki |
| `FTP_TIMEOUT_MS` | `10000` | timeout klienta FTPS |
| `FTP_MAX_CONCURRENT_SESSIONS` | `1` | maksymalna liczba równoległych sesji |
| `FTP_UPLOAD_MAX_BYTES` | `262144000` | maksymalny rozmiar uploadu |

Drukarka używa certyfikatu samopodpisanego. `rejectUnauthorized` jest wyłączone
wyłącznie po to, aby dopuścić ten certyfikat; klient sprawdza jego przypięty
odcisk SHA-256 przed wysłaniem nazwy użytkownika i hasła. Odcisk należy pozyskać
i zweryfikować przy pierwszym połączeniu z zaufanego klienta, np. WinSCP.

## API REST

Wszystkie ścieżki zdalne są bezwzględne. Próby użycia `..` oraz operacje
destrukcyjne na katalogu głównym `/` są odrzucane.

| Metoda | Endpoint | Wynik |
| --- | --- | --- |
| `GET` | `/files/connection` | test logowania, pinningu i listowania `/` |
| `GET` | `/files?path=/models` | lista wpisów w stabilnym formacie DTO |
| `GET` | `/files/models/model.3mf` | strumień pliku |
| `PUT` | `/files/models/model.3mf` | upload nowego pliku |
| `PUT` | `/files/models/model.3mf?force=true` | upload z zastąpieniem pliku |
| `POST` | `/files/move` | przeniesienie lub zmiana nazwy |
| `DELETE` | `/files/models/model.3mf` | usunięcie pliku |
| `DELETE` | `/files/by-name/file` | usunięcie nazwy dla listy par katalog/rozszerzenie |
| `DELETE` | `/files/by-extension?path=/logs&extension=.log` | usunięcie rozszerzenia w katalogu |
| `POST` | `/files/directories` | utworzenie katalogu |
| `DELETE` | `/files/directories?path=/models` | rekurencyjne usunięcie katalogu |

Upload wymaga `Content-Type: application/octet-stream`. Operacje modyfikujące
pojedynczy wpis zwracają `204 No Content`. Bez parametru `force=true` istniejący
plik nie jest modyfikowany, a API zwraca `409 Conflict`.

Nowy plik jest wysyłany pod unikalną nazwę tymczasową w tym samym katalogu.
Dopiero po pełnym zakończeniu transmisji następuje zmiana nazwy na docelową.
Przy nieudanej transmisji serwis podejmuje osobną próbę usunięcia pliku
tymczasowego. Znany z nagłówka `Content-Length` zbyt duży rozmiar jest odrzucany
przed otwarciem sesji FTPS.

Przy `force=true` poprzedni plik jest najpierw przenoszony pod nazwę backupową,
a nowa zawartość jest wysyłana bezpośrednio pod zwolnioną nazwę docelową. Po
udanym uploadzie backup jest usuwany. Jeśli transmisja się nie powiedzie, serwis
usuwa częściowy plik docelowy i podejmuje próbę przywrócenia poprzedniej wersji.

Błędy transportu są mapowane na `502 Bad Gateway`, timeouty na
`504 Gateway Timeout`, brak wpisu na `404 Not Found`, a konflikty nazw na
`409 Conflict`.

Usunięcie pliku o tej samej nazwie z wielu lokalizacji:

```http
DELETE /files/by-name/file
Content-Type: application/json
```

```json
{
  "targets": [
    { "path": "/models", "extension": ".3mf" },
    { "path": "/cache", "extension": ".gcode" },
    { "path": "/metadata", "extension": ".json" }
  ]
}
```

Endpoint sprawdza kolejno `/models/file.3mf`, `/cache/file.gcode` oraz
`/metadata/file.json`. Zwraca raport, dzięki któremu brak pliku w jednej
lokalizacji nie przerywa usuwania pozostałych:

```json
{
  "deleted": ["/models/file.3mf", "/metadata/file.json"],
  "notFound": ["/cache/file.gcode"]
}
```

Każdy target może dodatkowo zawierać `prefix` i `suffix`. Znak `?` dopasowuje
jeden dowolny znak, a `*` dowolny ciąg znaków, również pusty. Nazwa przekazana
w URL oraz `extension` są literalne. Rozszerzenie może być wieloczłonowe, ale
musi zaczynać się od kropki.

```http
DELETE /files/by-name/%28Niezapisany%29
Content-Type: application/json
```

```json
{
  "targets": [
    {
      "path": "/models",
      "prefix": "plate_*_",
      "suffix": "_?",
      "extension": ".gcode.3mf"
    }
  ]
}
```

Ten target dopasuje na przykład
`/models/plate_12_(Niezapisany)_a.gcode.3mf`, ale nie dopasuje suffixu
zawierającego dwa znaki.

Czyszczenie według rozszerzenia:

```http
DELETE /files/by-extension?path=/logs&extension=.log
```

Operacja nie jest rekurencyjna. Usuwa wyłącznie pliki znajdujące się bezpośrednio
w `/logs`, których nazwa kończy się rozszerzeniem `.log`. Katalogi są pomijane.
Odpowiedź korzysta z tego samego formatu `deleted`/`notFound`.

Przeniesienie:

```json
{
  "source": "/models/model.3mf",
  "destination": "/archive/model.3mf"
}
```

Utworzenie katalogu:

```json
{
  "path": "/models"
}
```

Przykładowa pozycja listy:

```json
{
  "name": "model.3mf",
  "path": "/models/model.3mf",
  "type": "file",
  "size": 1024,
  "modifiedAt": "2026-07-01T12:00:00.000Z"
}
```

## Uruchomienie i weryfikacja

Z katalogu głównego monorepo:

```bash
pnpm dev:ftps
pnpm --filter @cloudless/ftps-remote-manager test
pnpm --filter @cloudless/ftps-remote-manager test:e2e
pnpm --filter @cloudless/ftps-remote-manager lint
pnpm --filter @cloudless/ftps-remote-manager build
```

Testy jednostkowe i e2e używają atrap transportu i nie łączą się z drukarką.

Serwis nie ma własnego uwierzytelniania HTTP i domyślnie nasłuchuje wyłącznie
na `127.0.0.1`. Ustawienie `HOST=0.0.0.0` jest bezpieczne dopiero po ograniczeniu
dostępu firewallem albo umieszczeniu serwisu za uwierzytelnionym reverse proxy.
