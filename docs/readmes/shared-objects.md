# Współdzielenie typów, DTO i kontraktów

Ten dokument opisuje sposób współdzielenia typów danych pomiędzy usługami NestJS oraz aplikacją Angular w repozytorium **CloudLess Print Bridge**.

## Cel

Współdzielone kontrakty powinny zapewniać:

- spójne nazwy pól,
- spójne typy danych,
- ograniczenie duplikacji,
- wcześniejsze wykrywanie niezgodności przez TypeScript,
- czytelne granice pomiędzy usługami.

Współdzielić należy przede wszystkim kontrakty komunikacyjne, a nie wewnętrzną implementację usług.

## Zalecana lokalizacja

```text
packages/
└── shared-contracts/
    ├── src/
    │   ├── camera/
    │   ├── files/
    │   ├── printer/
    │   ├── video/
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
```

Przykładowe pliki:

```text
packages/shared-contracts/src/
├── camera/
│   ├── camera-status.ts
│   └── camera-summary.ts
├── files/
│   ├── remote-file.ts
│   └── storage-status.ts
├── printer/
│   ├── printer-command.ts
│   └── printer-status.ts
├── video/
│   ├── recording-info.ts
│   └── stream-status.ts
└── index.ts
```

## Nazwa pakietu

`packages/shared-contracts/package.json`:

```json
{
  "name": "@cloudless/shared-contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rimraf dist"
  }
}
```

Przykładowy `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
```

## Eksporty publiczne

`src/index.ts` powinien eksportować wyłącznie publiczne kontrakty:

```ts
export * from "./camera/camera-status";
export * from "./camera/camera-summary";
export * from "./files/remote-file";
export * from "./files/storage-status";
export * from "./printer/printer-command";
export * from "./printer/printer-status";
export * from "./video/recording-info";
export * from "./video/stream-status";
```

Aplikacje nie powinny importować plików przez wewnętrzne ścieżki pakietu.

Poprawnie:

```ts
import type { PrinterStatus } from "@cloudless/shared-contracts";
```

Niepoprawnie:

```ts
import type { PrinterStatus } from "../../../packages/shared-contracts/src/printer/printer-status";
```

## Instalacja pakietu w aplikacjach

```bash
pnpm --filter @cloudless/video-service-hub   add @cloudless/shared-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/ftps-remote-manager   add @cloudless/shared-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/mqtt-puppeteer   add @cloudless/shared-contracts@workspace:*
```

```bash
pnpm --filter @cloudless/octo-management-dashboard   add @cloudless/shared-contracts@workspace:*
```

Pakiet należy dodawać tylko do tych aplikacji, które faktycznie go używają.

## Co można współdzielić

Dobre kandydaty:

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

Nie należy umieszczać w `shared-contracts`:

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
// shared-contracts
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
import type { CreateCameraRequest } from "@cloudless/shared-contracts";
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

W takim przypadku `zod` staje się zależnością pakietu `shared-contracts`.

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
import type { CameraSummary } from "@cloudless/shared-contracts";
```

Jeżeli kontrakt jest używany tylko przez dwie usługi, nadal warto umieścić go w wydzielonym pakiecie zamiast tworzyć zależność aplikacja-do-aplikacji.

## OpenAPI jako źródło kontraktów

Dla kontraktów HTTP można rozważyć dwa podejścia.

### Podejście ręczne

Typy są definiowane w `shared-contracts`, a DTO NestJS je implementują.

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

Na początku:

- utworzyć `packages/shared-contracts`,
- współdzielić proste interfejsy i typy,
- pozostawić klasy DTO z dekoratorami w aplikacjach NestJS,
- implementować wspólne interfejsy przez klasy DTO,
- walidować komunikaty MQTT schematami runtime,
- używać `workspace:*` do zależności lokalnych.

Po ustabilizowaniu API:

- generować specyfikację OpenAPI,
- generować klienta TypeScript dla Angulara,
- automatycznie sprawdzać kompatybilność kontraktów w CI.
