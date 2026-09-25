# Zmienne środowiskowe CloudLess Print Bridge

Polski | [English](environment-variables.md)

Pełna referencja zmiennych na poziomie aplikacji z pliku `.env.example` w
głównym katalogu repo — co każda z nich konfiguruje i jaką wartość tam
wpisać. Ten dokument **nie** opisuje zmiennych `*_IMAGE`/`*_HOST_PORT`/
`*_CONTAINER_PORT` używanych przez `deploy/compose.yml` do wyboru obrazów i
publikowania portów — te opisuje
[running-ghcr-images_pl.md](./running-ghcr-images_pl.md).

Plik `.env` należy utworzyć w głównym katalogu repozytorium na podstawie
`.env.example`. Czasy podawane w nazwach zakończonych `_MS` są wyrażone w
milisekundach, a limity `_BYTES` w bajtach. Loadery backendów rozwijają również
odwołania `${NAZWA_ZMIENNEJ}` w wartościach pliku `.env`, np.:

```env
BAMBULAB_A1_IP=192.168.1.100
FTPS_REMOTE_MANAGER_FTP_HOST=${BAMBULAB_A1_IP}
```

Wartości przekazane bezpośrednio w środowisku procesu mają pierwszeństwo przed
wartościami w pliku `.env`. Nierozwiązane odwołanie pozostaje tekstem i zwykle
spowoduje błąd walidacji konkretnej konfiguracji; odwołania cykliczne są
odrzucane.

## Wspólne uwierzytelnianie

| Zmienna | Jaką wartość ustawić |
| --- | --- |
| `CLOUDLESS_AUTH_MODE` | Tryb ochrony API: `disabled` wyłącza uwierzytelnianie, `optional` akceptuje żądania z tokenem i bez niego, a `required` wymaga poprawnego tokenu. |
| `CLOUDLESS_AUTH_SHARED_SECRET` | Wspólny sekret podpisujący tokeny JWT. Ustaw tę samą, losową wartość o długości co najmniej 32 znaków we wszystkich usługach. |
| `CLOUDLESS_AUTH_SERVICE_ORDER` | Kolejność zaufanych usług wystawiających token. Podaj ich nazwy rozdzielone przecinkami; pierwsza dostępna usługa posłuży dashboardowi do uzyskania tokenu. |
| `CLOUDLESS_AUTH_TOKEN_TTL_SECONDS` | Czas ważności tokenu w sekundach. `86400` oznacza 24 godziny. |

## MQTT Puppeteer

| Zmienna | Jaką wartość ustawić |
| --- | --- |
| `MQTT_PUPPETEER_HOST` | Interfejs, na którym backend udostępnia HTTP. Ustaw `0.0.0.0` dla dostępu z sieci lub kontenera albo `127.0.0.1` tylko dla dostępu lokalnego. |
| `MQTT_PUPPETEER_PORT` | Port HTTP backendu MQTT Puppeteer. Standardowo `10320`; musi być wolny i zgodny z konfiguracją proxy oraz kontenera. |
| `MQTT_PUPPETEER_MQTT_HOST` | Adres IP lub nazwa hosta drukarki udostępniającej broker MQTT w trybie LAN. |
| `MQTT_PUPPETEER_MQTT_PORT` | Port MQTT drukarki. Dla szyfrowanego połączenia Bambu Lab zazwyczaj `8883`. |
| `MQTT_PUPPETEER_MQTT_USERNAME` | Nazwa użytkownika MQTT drukarki. Dla Bambu Lab w trybie LAN zwykle `bblp`. |
| `MQTT_PUPPETEER_MQTT_PASSWORD` | Hasło MQTT, czyli kod dostępu LAN odczytany z ustawień drukarki. |
| `MQTT_PUPPETEER_PRINTER_SN` | Numer seryjny drukarki używany do zbudowania tematów MQTT, np. `device/<SN>/report`. |
| `MQTT_PUPPETEER_MQTT_REJECT_UNAUTHORIZED` | `true` wymaga zaufanego certyfikatu TLS drukarki; `false` dopuszcza jej certyfikat lokalny lub samopodpisany. |
| `MQTT_PUPPETEER_MQTT_CONNECT_TIMEOUT_MS` | Maksymalny czas na zestawienie połączenia MQTT. `10000` oznacza 10 sekund. |
| `MQTT_PUPPETEER_MQTT_RECONNECT_PERIOD_MS` | Odstęp między próbami ponownego połączenia MQTT. `4000` oznacza 4 sekundy. |
| `MQTT_PUPPETEER_MQTT_KEEPALIVE_SECONDS` | Częstotliwość kontroli aktywności połączenia MQTT w sekundach. Typowa wartość to `60`. |
| `MQTT_PUPPETEER_OPERATION_TIMEOUT_MS` | Maksymalny czas oczekiwania na odpowiedź drukarki po wysłaniu polecenia. `30000` oznacza 30 sekund. |
| `MQTT_PUPPETEER_CORS_ORIGINS` | Dozwolone originy dashboardu (REST i Socket.IO), rozdzielone przecinkami, np. `http://localhost:10300,https://dashboard.example.com`. Wartość `*` odbija dowolny origin (tylko development). Domyślnie `http://localhost:4200` — **octo-management-dashboard w tym repo działa domyślnie na porcie `10300`** (patrz `angular.json`), więc ustaw jawnie `http://localhost:10300` lokalnie. |
| `MQTT_PUPPETEER_TELEMETRY_HISTORY_CAPACITY` | Liczba próbek telemetrii przechowywanych w buforze kołowym używanym do zasilenia wykresów dashboardu. Domyślnie `720`. |

## FTPS Remote Manager

| Zmienna | Jaką wartość ustawić |
| --- | --- |
| `FTPS_REMOTE_MANAGER_HOST` | Interfejs, na którym backend udostępnia HTTP. Ustaw `0.0.0.0` dla dostępu z sieci lub kontenera albo `127.0.0.1` tylko lokalnie. |
| `FTPS_REMOTE_MANAGER_PORT` | Port HTTP backendu FTPS. Standardowo `10321`; musi być wolny i zgodny z proxy oraz kontenerem. |
| `FTPS_REMOTE_MANAGER_FTP_HOST` | Adres IP lub nazwa hosta drukarki udostępniającej kartę pamięci przez FTPS. |
| `FTPS_REMOTE_MANAGER_FTP_PORT` | Port FTPS drukarki. Dla połączenia implicit FTPS zazwyczaj `990`. |
| `FTPS_REMOTE_MANAGER_FTP_USER` | Nazwa użytkownika FTPS drukarki. Dla Bambu Lab zwykle `bblp`. |
| `FTPS_REMOTE_MANAGER_FTP_PASSWORD` | Hasło FTPS, czyli kod dostępu LAN odczytany z ustawień drukarki. |
| `FTPS_REMOTE_MANAGER_FTP_TLS_MODE` | Tryb TLS serwera drukarki: `implicit` rozpoczyna szyfrowanie od razu, a `explicit` włącza je komendą po połączeniu. |
| `FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256` | Odcisk SHA-256 certyfikatu FTPS drukarki: dokładnie 64 znaki szesnastkowe; dwukropki są opcjonalne. Odczytaj go z zaufanego klienta FTPS. |
| `FTPS_REMOTE_MANAGER_FTP_TIMEOUT_MS` | Maksymalny czas oczekiwania na operację lub połączenie FTPS. `10000` oznacza 10 sekund. |
| `FTPS_REMOTE_MANAGER_FTP_MAX_CONCURRENT_SESSIONS` | Maksymalna liczba równoczesnych sesji FTPS. Dla drukarki bezpieczną wartością jest `1`. |
| `FTPS_REMOTE_MANAGER_FTP_UPLOAD_MAX_BYTES` | Maksymalny rozmiar wysyłanego pliku. `262144000` oznacza 250 MiB. |

## Video Service Hub

| Zmienna | Jaką wartość ustawić |
| --- | --- |
| `VIDEO_SERVICE_HUB_HOST` | Interfejs, na którym backend udostępnia HTTP. Ustaw `0.0.0.0` dla dostępu z sieci lub kontenera albo `127.0.0.1` tylko lokalnie. |
| `VIDEO_SERVICE_HUB_PORT` | Port HTTP usługi wideo. Standardowo `10322`; musi być wolny i zgodny z proxy oraz kontenerem. |
| `VIDEO_SERVICE_HUB_STORAGE_PATH` | Katalog przechowywania nagrań, zdjęć, audio i transmisji. Podaj ścieżkę zapisywalną przez proces; w Dockerze używany jest trwały wolumen. |
| `VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES` | Maksymalny rozmiar pojedynczego zdjęcia JPEG. `20971520` oznacza 20 MiB. |
| `VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES` | Maksymalny rozmiar jednej części nagrania MJPEG. `16777216` oznacza 16 MiB. |
| `VIDEO_SERVICE_HUB_AUDIO_MAX_BYTES` | Maksymalny rozmiar pojedynczego pliku audio. `10485760` oznacza 10 MiB. |
| `VIDEO_SERVICE_HUB_LIVE_MAX_BYTES` | Maksymalna ilość danych zapisywana dla jednej transmisji live. `1073741824` oznacza 1 GiB. |
| `VIDEO_SERVICE_HUB_LIVE_VIEWER_BUFFER_BYTES` | Maksymalny bufor danych oczekujących dla jednego odbiorcy live. `2097152` oznacza 2 MiB. |
| `VIDEO_SERVICE_HUB_CAMERA_COMMAND_TIMEOUT_MS` | Maksymalny czas oczekiwania na wykonanie polecenia przez kamerę. `10000` oznacza 10 sekund. |
| `VIDEO_SERVICE_HUB_MQTT_PORT` | Port wbudowanego brokera MQTT używanego przez kamery. Standardowo `1883`; wartość `0` jest przeznaczona głównie do testów z portem przydzielanym automatycznie. |
| `VIDEO_SERVICE_HUB_MQTT_CONNECT_TIMEOUT_MS` | Maksymalny czas zestawiania połączenia MQTT. `10000` oznacza 10 sekund. |
| `VIDEO_SERVICE_HUB_MQTT_RECONNECT_PERIOD_MS` | Odstęp między próbami ponownego połączenia MQTT. `1000` oznacza 1 sekundę. |
| `VIDEO_SERVICE_HUB_MQTT_CAMERA_ONLINE_TTL_MS` | Czas od ostatniej wiadomości, przez który kamera jest uznawana za online. `60000` oznacza 60 sekund. |

## Powiązane dokumenty

- [running-ghcr-images_pl.md](./running-ghcr-images_pl.md) — uruchamianie opublikowanych obrazów z GHCR, w tym zmienne obrazu/portów na poziomie compose, których nie opisuje ten dokument.
- [operations_pl.md](./operations_pl.md) — konfiguracja CI/CD i wdrożeń tego repo.
- [architecture_pl.md](./architecture_pl.md) — mapa architektury między usługami.
