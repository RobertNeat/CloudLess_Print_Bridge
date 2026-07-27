# Packages

Katalog zawiera współdzielone pakiety używane przez aplikacje w monorepo.

## Dostępne pakiety

### `@cloudless/printer-contracts`

Wspólny model biznesowy drukarki dla backendu i przyszłego frontendu.

```ts
import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
```

Pakiet znajduje się w [`printer-contracts`](./printer-contracts/README.md) i
nie zależy od konkretnego transportu ani frameworka.
