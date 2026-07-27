# @cloudless/printer-contracts

Współdzielone, niezależne od transportu kontrakty danych dla backendu i
przyszłego frontendu CloudLess Print Bridge.

```ts
import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
```

Pakiet nie zawiera zależności od NestJS, MQTT ani Socket.IO. Jest jedynym
źródłem definicji biznesowego modelu drukarki zwracanego przez
`mqtt-puppeteer`.
