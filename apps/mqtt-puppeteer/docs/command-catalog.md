<!-- Wygenerowano automatycznie przez scripts/generate-command-catalog-doc.ts — nie edytuj ręcznie. -->

# Katalog komend: profil `bambu-lab-a1`

Ten dokument odzwierciedla dokładnie to, co zwraca w runtime `GET /commands`
dla aktualnie aktywnego profilu drukarki. Interaktywny, zawsze aktualny
widok (wraz ze schematem OpenAPI) dostępny jest też pod `/docs`.

## Bezpieczny zakres ruchu (`machineEnvelope`)

| Oś | Minimum | Maksimum |
| --- | --- | --- |
| X | 0 | 256 |
| Y | 0 | 256 |
| Z | 20 | 240 |

## Komendy (15)

### `fetch-status`

Request a complete printer status report

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `pause-print`

Pause the current print job

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `resume-print`

Resume the current print job

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `cancel-print`

Cancel the current print job

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `set-print-speed`

Set the speed mode of the current print job

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `mode` | `string` | wymagany, jedno z: silent, standard, sport, ludicrous |  |

_Źródło: `profile:bambu-lab-a1`_

### `load-filament`

Load filament from an AMS slot or external spool

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `sourceKind` | `string` | wymagany, jedno z: ams, external |  |
| `amsUnitId` | `number` | min 0, całkowity |  |
| `slotId` | `number` | min 0, całkowity |  |
| `filamentId` | `string` | — |  |
| `targetTemperature` | `number` | min 0, max 300, całkowity |  |

**Uwagi bezpieczeństwa:**
- The target nozzle temperature must be suitable for the filament.

_Źródło: `profile:bambu-lab-a1`_

### `unload-filament`

Unload the currently loaded filament

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `set-filament`

Assign a filament definition to an AMS slot or external spool

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `sourceKind` | `string` | wymagany, jedno z: ams, external |  |
| `amsUnitId` | `number` | min 0, całkowity |  |
| `slotId` | `number` | min 0, całkowity |  |
| `filamentId` | `string` | wymagany |  |
| `trayColor` | `string` | wzorzec ^[0-9A-Fa-f]{8}$ | RRGGBBAA |
| `nozzleTemperatureMin` | `number` | min 0, max 300, całkowity |  |
| `nozzleTemperatureMax` | `number` | min 0, max 300, całkowity |  |

_Źródło: `profile:bambu-lab-a1`_

### `set-bed-temperature`

Set the build plate target temperature

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `celsius` | `number` | wymagany, min 0, max 120 |  |

_Źródło: `profile:bambu-lab-a1`_

### `set-nozzle-temperature`

Set the hotend target temperature

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `celsius` | `number` | wymagany, min 0, max 300 |  |

_Źródło: `profile:bambu-lab-a1`_

### `set-part-fan`

Set part cooling fan speed as a percentage

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `percent` | `number` | wymagany, min 0, max 100 |  |

_Źródło: `profile:bambu-lab-a1`_

### `set-light`

Turn the chamber light on or off

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `enabled` | `boolean` | wymagany |  |

_Źródło: `profile:bambu-lab-a1`_

### `home`

Home all axes

_Brak parametrów._

_Źródło: `profile:bambu-lab-a1`_

### `move-absolute`

Move one or more axes in absolute coordinate mode

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `x` | `number` | min 0, max 256 |  |
| `y` | `number` | min 0, max 256 |  |
| `z` | `number` | min 20, max 240 |  |
| `feedrate` | `number` | min 1, max 30000, domyślnie 3000 |  |

**Uwagi bezpieczeństwa:**
- The A1 profile enforces X/Y 0..256 mm and Z 20..240 mm.
- Home the printer before relying on absolute coordinates.

_Źródło: `profile:bambu-lab-a1`_

### `extrude-relative`

Extrude or retract filament in relative mode

| Parametr | Typ | Ograniczenia | Opis |
| --- | --- | --- | --- |
| `millimeters` | `number` | wymagany, min -50, max 50 |  |
| `feedrate` | `number` | min 1, max 600, domyślnie 600 |  |

**Uwagi bezpieczeństwa:**
- Heat the nozzle before extruding filament.

_Źródło: `profile:bambu-lab-a1`_
