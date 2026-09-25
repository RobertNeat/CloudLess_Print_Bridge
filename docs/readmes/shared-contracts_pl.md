# Współdzielenie typów, DTO i kontraktów

Polski | [English](shared-contracts.md)

Ogólny wzorzec współdzielenia typów danych pomiędzy usługami NestJS oraz
aplikacją Angular w repozytorium **CloudLess Print Bridge**, ilustrowany na
przykładzie realnego pakietu `packages/printer-contracts`
(`@cloudless/printer-contracts`) — zobacz
[architecture_pl.md](./architecture_pl.md#dlaczego-istnieje-printer-contracts)
po dokładny opis tego, co ten pakiet faktycznie eksportuje dzisiaj. Ten
dokument opisuje regułę ogólną (jak podejmować decyzje o współdzieleniu
kontraktów), nie inwentarz aktualnych eksportów.

## Cel

Współdzielone kontrakty powinny zapewniać:

- spójne nazwy pól,
- spójne typy danych,
- ograniczenie duplikacji,
- wcześniejsze wykrywanie niezgodności przez TypeScript,
- czytelne granice pomiędzy usługami.

Współdzielić należy przede wszystkim kontrakty komunikacyjne, a nie wewnętrzną implementację usług.

## Lokalizacja w tym repo

```text
packages/
└── printer-contracts/
    ├── src/
    │   └── ...
    ├── package.json
    └── tsconfig.json
```

Pakiet nazywa się `@cloudless/printer-contracts` i zawiera transportowo
niezależne DTO domeny drukarki (m.in. zmerdżowany model stanu drukarki,
sloty AMS, zewnętrzny szpul, typy pozycji/obwiedni maszyny, wyniki komend).
Zasady poniżej stosuj analogicznie, gdyby powstał kolejny pakiet
współdzielony w `packages/` — nie każdy przyszły pakiet musi nazywać się
tak samo.

`src/index.ts` powinien eksportować wyłącznie publiczne kontrakty. Aplikacje
nie powinny importować plików przez wewnętrzne ścieżki pakietu.

Poprawnie:

```ts
import type { PrinterDomainModelDto } from "@cloudless/printer-contracts";
```

Niepoprawnie:

```ts
import type { PrinterDomainModelDto } from "../../../packages/printer-contracts/src/printer/printer-domain-model.dto";
```

## Instalacja pakietu w aplikacjach

```bash
pnpm --filter @cloudless/video-service-hub   add @cloudless/printer-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/ftps-remote-manager   add @cloudless/printer-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/mqtt-puppeteer   add @cloudless/printer-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/octo-management-dashboard   add @cloudless/printer-contracts@workspace:*
```

Pakiet należy dodawać tylko do tych aplikacji, które faktycznie go używają.

## Co można współdzielić

Dobre kandydaci:

- interfejsy odpowiedzi HTTP,
- typy payloadów MQTT,
- typy statusów urządzeń,
- identyfikatory i enumeracje,
- formaty zdarzeń,
- proste typy danych,
- kontrakty WebSocket,
- typy wygenerowane z OpenAPI,
- stałe wynikające z publicznego protokołu.

Przykład:

```ts
export type PrinterConnectionState =
  | "offline"
  | "connecting"
  | "online"
  | "error";

export interface PrinterStatus {
  printerId: string;
  state: PrinterConnectionState;
  currentTemperature?: number;
  targetTemperature?: number;
  updatedAt: string;
}
```

## Czego nie współdzielić

Nie należy umieszczać w `printer-contracts` (ani w żadnym przyszłym pakiecie współdzielonym):

- encji ORM,
- modeli Prisma lub TypeORM używanych bezpośrednio,
- serwisów NestJS,
- kontrolerów,
- dekoratorów zależnych od frameworka,
- logiki biznesowej,
- repozytoriów bazodanowych,
- konfiguracji środowiskowej,
- typów zawierających sekrety,
- klas specyficznych wyłącznie dla jednej aplikacji.

Kontrakt API nie powinien ujawniać struktury bazy danych.

## DTO NestJS a typy współdzielone

DTO NestJS często zawierają dekoratory:

```ts
export class CreateCameraDto {
  @IsString()
  name!: string;

  @IsUrl()
  streamUrl!: string;
}
```

Takiej klasy nie należy bezpośrednio importować do Angulara, ponieważ:

- zależy od `class-validator`,
- może zależeć od `@nestjs/swagger`,
- zwiększa sprzężenie frontendu z NestJS,
- może wprowadzić zależności runtime niepotrzebne w przeglądarce.

Zalecany podział:

```ts
// printer-contracts
export interface CreateCameraRequest {
  name: string;
  streamUrl: string;
}
```

```ts
// aplikacja NestJS
export class CreateCameraDto implements CreateCameraRequest {
  @IsString()
  name!: string;

  @IsUrl()
  streamUrl!: string;
}
```

Angular korzysta z interfejsu:

```ts
import type { CreateCameraRequest } from "@cloudless/printer-contracts";
```

Backend zachowuje walidację w swojej warstwie wejściowej.

## Typy odpowiedzi

Przykład wspólnego kontraktu:

```ts
export interface CameraSummary {
  id: string;
  name: string;
  online: boolean;
  streamAvailable: boolean;
}
```

NestJS:

```ts
@Get()
async getCameras(): Promise<CameraSummary[]> {
  return this.cameraService.getSummaries();
}
```

Angular:

```ts
getCameras(): Observable<CameraSummary[]> {
  return this.http.get<CameraSummary[]>('/api/cameras');
}
```

TypeScript nie waliduje jednak danych otrzymanych w runtime. W przypadku danych pochodzących z sieci warto rozważyć walidację schematem.

## Interfejsy czy schematy runtime

Same interfejsy TypeScript znikają po kompilacji.

Jeżeli potrzebna jest walidacja danych pomiędzy usługami, można użyć biblioteki schematów, np. Zod.

Przykład:

```ts
import { z } from "zod";

export const printerStatusSchema = z.object({
  printerId: z.string(),
  state: z.enum(["offline", "connecting", "online", "error"]),
  currentTemperature: z.number().optional(),
  targetTemperature: z.number().optional(),
  updatedAt: z.string().datetime()
});

export type PrinterStatus = z.infer<typeof printerStatusSchema>;
```

W takim przypadku `zod` staje się zależnością pakietu.

Schematy runtime są szczególnie przydatne dla:

- komunikatów MQTT,
- zdarzeń WebSocket,
- danych od urządzeń,
- odpowiedzi z usług zewnętrznych,
- danych, które mogą być wysyłane przez różne wersje aplikacji.

## Współdzielenie kontraktów MQTT

Kontrakty MQTT powinny opisywać:

- nazwę lub wzorzec topicu,
- payload komendy,
- payload odpowiedzi,
- wersję komunikatu,
- identyfikator urządzenia,
- identyfikator korelacji.

Przykład:

```ts
export interface StartPrintCommand {
  version: 1;
  commandId: string;
  printerId: string;
  filePath: string;
  requestedAt: string;
}
```

```ts
export interface PrinterCommandResult {
  version: 1;
  commandId: string;
  printerId: string;
  success: boolean;
  errorCode?: string;
  completedAt: string;
}
```

Dobrą praktyką jest umieszczanie wersji kontraktu bezpośrednio w komunikacie.

## Kontrakty pomiędzy backendami

Usługi nie powinny importować wzajemnie kodu z katalogów `apps/`.

Niepoprawnie:

```ts
import { SomeDto } from "../../video-service-hub/src/...";
```

Poprawnie:

```ts
import type { CameraSummary } from "@cloudless/printer-contracts";
```

Jeżeli kontrakt jest używany tylko przez dwie usługi, nadal warto umieścić go w wydzielonym pakiecie zamiast tworzyć zależność aplikacja-do-aplikacji.

## OpenAPI jako źródło kontraktów

Dla kontraktów HTTP można rozważyć dwa podejścia.

### Podejście ręczne

Typy są definiowane w pakiecie współdzielonym, a DTO NestJS je implementują.

Zalety:

- prosta konfiguracja,
- pełna kontrola nad nazwami,
- szybki start.

Wady:

- możliwość rozjechania dokumentacji OpenAPI i typów,
- konieczność ręcznego utrzymywania kontraktów.

### Podejście generowane

Backend generuje dokument OpenAPI, a klient Angular jest generowany automatycznie.

Zalety:

- kontrakt HTTP wynika bezpośrednio z API,
- mniej ręcznego duplikowania,
- możliwość generowania klienta.

Wady:

- bardziej złożony proces budowania,
- konieczność pilnowania kompatybilności generatora,
- dodatkowe pliki generowane.

Na początku projektu można użyć ręcznych kontraktów. Po ustabilizowaniu API warto przejść na generowanie klienta Angular z OpenAPI.

## Zasady wersjonowania kontraktów

Zmiany należy klasyfikować jako:

- kompatybilne — dodanie opcjonalnego pola,
- potencjalnie niekompatybilne — zmiana znaczenia pola,
- niekompatybilne — usunięcie pola, zmiana jego typu lub nazwy.

Przykład kompatybilnej zmiany:

```ts
export interface CameraSummary {
  id: string;
  name: string;
  online: boolean;
  streamAvailable: boolean;
  firmwareVersion?: string;
}
```

Zmiany niekompatybilne powinny być skoordynowane pomiędzy usługą produkującą dane i wszystkimi konsumentami.

## Reguły projektowe

1. Aplikacje mogą zależeć od pakietów w `packages/`.
2. Pakiety w `packages/` nie mogą zależeć od aplikacji w `apps/`.
3. Jedna aplikacja nie może importować kodu bezpośrednio z innej aplikacji.
4. Typy współdzielone powinny być niezależne od NestJS i Angulara.
5. Walidacja wejścia HTTP pozostaje w aplikacji NestJS.
6. Kontrakty zewnętrzne powinny mieć stabilne nazwy i udokumentowane znaczenie.
7. Dane z sieci powinny być walidowane w runtime, gdy źródło nie jest w pełni zaufane.
8. Pola dat powinny być przesyłane jako tekst w formacie ISO 8601.
9. Kontrakty MQTT i zdarzeń powinny zawierać numer wersji.
10. Publiczne eksporty powinny przechodzić przez `src/index.ts`.

## Zalecany kierunek dla projektu

- utrzymywać `packages/printer-contracts` jako źródło prawdy dla modelu domeny drukarki,
- współdzielić proste interfejsy i typy,
- pozostawić klasy DTO z dekoratorami w aplikacjach NestJS,
- implementować wspólne interfejsy przez klasy DTO,
- walidować komunikaty MQTT schematami runtime,
- używać `workspace:*` do zależności lokalnych.

Po dalszym ustabilizowaniu API warto rozważyć:

- generowanie specyfikacji OpenAPI,
- generowanie klienta TypeScript dla Angulara,
- automatyczne sprawdzanie kompatybilności kontraktów w CI.

## Powiązane dokumenty

- [architecture_pl.md](./architecture_pl.md) — dlaczego `printer-contracts` istnieje i co dokładnie eksportuje dzisiaj.
- `packages/printer-contracts/README.md` — lista eksportowanych typów.
- `packages/README.md` — katalog `packages/` jako całość.
