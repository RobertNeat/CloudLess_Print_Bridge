# Sharing types, DTOs, and contracts

[Polski](shared-contracts_pl.md) | English

The general pattern for sharing data types between the NestJS services and
the Angular app in **CloudLess Print Bridge**, illustrated against the real
`packages/printer-contracts` package (`@cloudless/printer-contracts`) — see
[architecture.md](./architecture.md#why-printer-contracts-exists) for the
precise, current description of what that package actually exports. This
document describes the general rule (how to decide what to share as a
contract), not an inventory of current exports.

## Goal

Shared contracts should ensure:

- consistent field names,
- consistent data types,
- reduced duplication,
- earlier detection of mismatches via TypeScript,
- clear boundaries between services.

What should be shared is primarily communication contracts, not a service's
internal implementation.

## Location in this repo

```text
packages/
└── printer-contracts/
    ├── src/
    │   └── ...
    ├── package.json
    └── tsconfig.json
```

The package is named `@cloudless/printer-contracts` and holds
transport-agnostic printer-domain DTOs (the merged printer state model, AMS
slots, external spool, machine envelope/position types, command results,
among others). Apply the rules below by analogy if another shared package
is ever added under `packages/` — not every future package has to share
this name.

`src/index.ts` should export only public contracts. Applications should not
import files through the package's internal paths.

Correct:

```ts
import type { PrinterDomainModelDto } from "@cloudless/printer-contracts";
```

Incorrect:

```ts
import type { PrinterDomainModelDto } from "../../../packages/printer-contracts/src/printer/printer-domain-model.dto";
```

## Installing the package in applications

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

Only add the package to applications that actually use it.

## What is a good fit to share

Good candidates:

- HTTP response interfaces,
- MQTT payload types,
- device status types,
- identifiers and enums,
- event formats,
- simple data types,
- WebSocket contracts,
- OpenAPI-generated types,
- constants derived from a public protocol.

Example:

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

## What not to share

Do not put the following in `printer-contracts` (or any future shared
package):

- ORM entities,
- Prisma or TypeORM models used directly,
- NestJS services,
- controllers,
- framework-dependent decorators,
- business logic,
- database repositories,
- environment configuration,
- types containing secrets,
- classes specific to a single application only.

An API contract should not expose database structure.

## NestJS DTOs vs. shared types

NestJS DTOs often carry decorators:

```ts
export class CreateCameraDto {
  @IsString()
  name!: string;

  @IsUrl()
  streamUrl!: string;
}
```

That class should not be imported directly into Angular, because:

- it depends on `class-validator`,
- it may depend on `@nestjs/swagger`,
- it increases frontend coupling to NestJS,
- it may pull in runtime dependencies unnecessary in the browser.

Recommended split:

```ts
// printer-contracts
export interface CreateCameraRequest {
  name: string;
  streamUrl: string;
}
```

```ts
// NestJS application
export class CreateCameraDto implements CreateCameraRequest {
  @IsString()
  name!: string;

  @IsUrl()
  streamUrl!: string;
}
```

Angular consumes the interface:

```ts
import type { CreateCameraRequest } from "@cloudless/printer-contracts";
```

The backend keeps validation in its own input layer.

## Response types

Example of a shared contract:

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

TypeScript, however, does not validate data received at runtime. For data
coming over the network, consider schema-based validation.

## Interfaces vs. runtime schemas

Plain TypeScript interfaces disappear at compile time.

If runtime validation is needed between services, a schema library such as
Zod can be used.

Example:

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

In that case, `zod` becomes a dependency of the package.

Runtime schemas are especially useful for:

- MQTT messages,
- WebSocket events,
- data from devices,
- responses from external services,
- data that may be sent by different application versions.

## Sharing MQTT contracts

MQTT contracts should describe:

- the topic name or pattern,
- the command payload,
- the response payload,
- the message version,
- the device identifier,
- the correlation identifier.

Example:

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

It's good practice to include the contract version directly in the message.

## Contracts between backends

Services should not import each other's code from directories under
`apps/`.

Incorrect:

```ts
import { SomeDto } from "../../video-service-hub/src/...";
```

Correct:

```ts
import type { CameraSummary } from "@cloudless/printer-contracts";
```

If a contract is used by only two services, it is still worth placing it in
a dedicated package rather than creating an app-to-app dependency.

## OpenAPI as a contract source

Two approaches are worth considering for HTTP contracts.

### Manual approach

Types are defined in the shared package, and NestJS DTOs implement them.

Advantages:

- simple setup,
- full control over naming,
- quick to start.

Disadvantages:

- OpenAPI documentation and types can drift apart,
- contracts require manual upkeep.

### Generated approach

The backend generates an OpenAPI document, and the Angular client is
generated automatically.

Advantages:

- the HTTP contract follows directly from the API,
- less manual duplication,
- a client can be generated.

Disadvantages:

- a more complex build process,
- generator compatibility must be watched,
- additional generated files.

Early in a project's life, manual contracts are fine. Once the API
stabilizes, it's worth moving to generating the Angular client from
OpenAPI.

## Contract versioning rules

Changes should be classified as:

- compatible — adding an optional field,
- potentially incompatible — changing a field's meaning,
- incompatible — removing a field, or changing its type or name.

Example of a compatible change:

```ts
export interface CameraSummary {
  id: string;
  name: string;
  online: boolean;
  streamAvailable: boolean;
  firmwareVersion?: string;
}
```

Incompatible changes should be coordinated between the producing service
and all consumers.

## Design rules

1. Applications may depend on packages under `packages/`.
2. Packages under `packages/` must not depend on applications under `apps/`.
3. One application must not import code directly from another application.
4. Shared types should be independent of NestJS and Angular.
5. HTTP input validation stays in the NestJS application.
6. External contracts should have stable names and documented meaning.
7. Network data should be validated at runtime when the source isn't fully trusted.
8. Date fields should be transmitted as ISO 8601 text.
9. MQTT and event contracts should carry a version number.
10. Public exports should go through `src/index.ts`.

## Recommended direction for the project

- keep `packages/printer-contracts` as the source of truth for the printer
  domain model,
- share simple interfaces and types,
- keep decorated DTO classes in the NestJS applications,
- implement shared interfaces via DTO classes,
- validate MQTT messages with runtime schemas,
- use `workspace:*` for local dependencies.

Once the API stabilizes further, consider:

- generating an OpenAPI specification,
- generating a TypeScript client for Angular,
- automatically checking contract compatibility in CI.

## Related docs

- [architecture.md](./architecture.md) — why `printer-contracts` exists and what it actually exports today.
- `packages/printer-contracts/README.md` — the list of exported types.
- `packages/README.md` — the `packages/` directory as a whole.
