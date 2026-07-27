# @cloudless/printer-contracts

Współdzielone, niezależne od transportu kontrakty danych dla backendu i
przyszłego frontendu CloudLess Print Bridge.

```ts
import type {
  AmsSlotDto,
  AmsUnitDto,
  ExternalSpoolDto,
  PrinterDomainModelDto,
  PrinterOperationResultDto
} from '@cloudless/printer-contracts';
```

Pakiet nie zawiera zależności od NestJS, MQTT ani Socket.IO. Jest jedynym
źródłem definicji biznesowego modelu drukarki zwracanego przez
`mqtt-puppeteer`.

Kontrakty obejmują jawny model domenowy AMS oraz końcowy wynik skorelowanej
operacji drukarki (`acknowledged`, `rejected` lub `timed_out`).
