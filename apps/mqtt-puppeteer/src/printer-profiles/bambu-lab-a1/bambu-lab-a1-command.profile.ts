import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  AmsTopologyDto,
  HeaterCapabilitiesDto,
  MachineEnvelopeDto,
  PrintSpeedMode,
} from '@cloudless/printer-contracts';
import { isJsonObject, type JsonObject } from '../../common/json';
import type {
  CommandDefinition,
  CommandParameters,
} from '../../commands/command.types';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { FilamentCatalogService } from '../../filaments/filament-catalog.service';
import type {
  PayloadSafetyResult,
  PrinterCommandProfile,
} from '../printer-command-profile';

const source = 'profile:bambu-lab-a1';
const externalAmsId = 255;
const externalTrayId = 254;

/**
 * Physical travel envelope for the Bambu Lab A1, confirmed safe with wiggle
 * room in docs/TMP_bambulab_A1_commands.md. This is the ONLY place these
 * numbers should appear — every other layer reads them through
 * getMachineEnvelope()/inspectPayload() instead of repeating literals.
 */
const machineEnvelope: MachineEnvelopeDto = {
  x: { minimum: 0, maximum: 256 },
  y: { minimum: 0, maximum: 256 },
  z: { minimum: 20, maximum: 240 },
};

/**
 * The Bambu Lab A1 has no chamber heater (it is a bed-slinger with only bed
 * and nozzle heaters) — this is a genuine hardware fact, not a placeholder.
 * Kept alongside machineEnvelope as the single place this model's heater
 * capabilities are declared.
 */
const heaterCapabilities: HeaterCapabilitiesDto = {
  hasChamberHeater: false,
};

interface ResolvedSource {
  kind: 'ams' | 'external';
  unitId?: number;
  slotId?: number;
}

@Injectable()
export class BambuLabA1CommandProfile implements PrinterCommandProfile {
  readonly id = 'bambu-lab-a1';
  readonly topology: AmsTopologyDto;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly filaments: FilamentCatalogService,
  ) {
    this.topology = {
      unitCount: config.filamentSystem.amsUnitCount,
      slotsPerUnit: config.filamentSystem.slotsPerUnit,
      externalSpool: config.filamentSystem.externalSpool,
    };
  }

  getCommands(): readonly CommandDefinition[] {
    return [
      this.command(
        'fetch-status',
        'Request a complete printer status report',
        {},
        () => ({
          pushing: {
            sequence_id: '0',
            command: 'pushall',
            version: 1,
            push_target: 1,
          },
        }),
      ),
      this.printAction('pause-print', 'Pause the current print job', 'pause'),
      this.printAction(
        'resume-print',
        'Resume the current print job',
        'resume',
      ),
      this.printAction('cancel-print', 'Cancel the current print job', 'stop'),
      this.command(
        'set-print-speed',
        'Set the speed mode of the current print job',
        {
          mode: {
            type: 'string',
            required: true,
            values: ['silent', 'standard', 'sport', 'ludicrous'],
          },
        },
        (parameters) => ({
          print: {
            sequence_id: '0',
            command: 'print_speed',
            param: speedLevel(string(parameters, 'mode') as PrintSpeedMode),
          },
        }),
      ),
      this.command(
        'load-filament',
        'Load filament from an AMS slot or external spool',
        this.filamentSourceParameters({
          filamentId: { type: 'string' },
          targetTemperature: {
            type: 'number',
            integer: true,
            minimum: 0,
            maximum: 300,
          },
        }),
        (parameters) => this.loadFilament(parameters),
        ['The target nozzle temperature must be suitable for the filament.'],
      ),
      this.command(
        'unload-filament',
        'Unload the currently loaded filament',
        {},
        () => ({
          print: {
            sequence_id: '1003',
            command: 'unload_filament',
          },
        }),
      ),
      this.command(
        'set-filament',
        'Assign a filament definition to an AMS slot or external spool',
        this.filamentSourceParameters({
          filamentId: { type: 'string', required: true },
          trayColor: {
            type: 'string',
            pattern: '^[0-9A-Fa-f]{8}$',
            description: 'RRGGBBAA',
          },
          nozzleTemperatureMin: {
            type: 'number',
            integer: true,
            minimum: 0,
            maximum: 300,
          },
          nozzleTemperatureMax: {
            type: 'number',
            integer: true,
            minimum: 0,
            maximum: 300,
          },
        }),
        (parameters) => this.setFilament(parameters),
      ),
      this.command(
        'set-bed-temperature',
        'Set the build plate target temperature',
        {
          celsius: {
            type: 'number',
            required: true,
            minimum: 0,
            maximum: 120,
          },
        },
        (parameters) => gcode(`M140 S${number(parameters, 'celsius')}\n`),
      ),
      this.command(
        'set-nozzle-temperature',
        'Set the hotend target temperature',
        {
          celsius: {
            type: 'number',
            required: true,
            minimum: 0,
            maximum: 300,
          },
        },
        (parameters) => gcode(`M104 S${number(parameters, 'celsius')}\n`),
      ),
      this.command(
        'set-part-fan',
        'Set part cooling fan speed as a percentage',
        {
          percent: {
            type: 'number',
            required: true,
            minimum: 0,
            maximum: 100,
          },
        },
        (parameters) => {
          const pwm = Math.round((number(parameters, 'percent') / 100) * 255);
          return gcode(`M106 P1 S${pwm}\n`);
        },
      ),
      this.command(
        'set-light',
        'Turn the chamber light on or off',
        { enabled: { type: 'boolean', required: true } },
        (parameters) => ({
          system: {
            sequence_id: '0',
            command: 'ledctrl',
            led_node: 'chamber_light',
            led_mode: boolean(parameters, 'enabled') ? 'on' : 'off',
          },
        }),
      ),
      this.command('home', 'Home all axes', {}, () => gcode('G28\n')),
      this.moveAbsoluteCommand(),
      this.extrudeRelativeCommand(),
    ];
  }

  getMachineEnvelope(): MachineEnvelopeDto {
    return machineEnvelope;
  }

  getHeaterCapabilities(): HeaterCapabilitiesDto {
    return heaterCapabilities;
  }

  /**
   * Rejects any fully-rendered payload that would move the tool head
   * outside machineEnvelope, regardless of how the payload was produced.
   * This is what closes the `POST /commands/raw` bypass: hand-crafted gcode
   * is inspected the same way a catalog-built command's gcode would be.
   */
  inspectPayload(payload: JsonObject): PayloadSafetyResult {
    const gcodeLine = extractGcodeLine(payload);
    if (gcodeLine === undefined) return { safe: true };

    const target = parseAbsoluteMoveTarget(gcodeLine);
    if (!target) return { safe: true };

    for (const [axis, range] of Object.entries(machineEnvelope) as Array<
      [keyof MachineEnvelopeDto, MachineEnvelopeDto[keyof MachineEnvelopeDto]]
    >) {
      const value = target[axis];
      if (value === undefined) continue;
      if (value < range.minimum || value > range.maximum) {
        return {
          safe: false,
          reason: `Axis ${axis.toUpperCase()} target ${value} is outside the safe range ${range.minimum}..${range.maximum}`,
          targetPosition: target,
        };
      }
    }

    return { safe: true, targetPosition: target };
  }

  private loadFilament(parameters: CommandParameters): JsonObject {
    const sourceLocation = this.resolveSource(parameters);
    const filament = optionalString(parameters, 'filamentId');
    const definition = filament
      ? this.filaments.getResolved(filament)
      : undefined;
    const targetTemperature =
      optionalNumber(parameters, 'targetTemperature') ??
      definition?.nozzleTemperatureMax;
    if (targetTemperature === undefined) {
      throw new BadRequestException(
        'load-filament requires filamentId or targetTemperature',
      );
    }

    if (sourceLocation.kind === 'external') {
      return {
        print: {
          sequence_id: '1002',
          command: 'ams_change_filament',
          target: externalTrayId,
          slot_id: externalTrayId,
          curr_temp: -1,
          tar_temp: targetTemperature,
        },
      };
    }

    return {
      print: {
        sequence_id: '1002',
        command: 'ams_change_filament',
        ams_id: sourceLocation.unitId!,
        slot_id: sourceLocation.slotId!,
        target:
          sourceLocation.unitId! * this.topology.slotsPerUnit +
          sourceLocation.slotId!,
        curr_temp: -1,
        tar_temp: targetTemperature,
      },
    };
  }

  private setFilament(parameters: CommandParameters): JsonObject {
    const sourceLocation = this.resolveSource(parameters);
    const definition = this.filaments.getResolved(
      string(parameters, 'filamentId'),
    );
    const minimum =
      optionalNumber(parameters, 'nozzleTemperatureMin') ??
      definition.nozzleTemperatureMin;
    const maximum =
      optionalNumber(parameters, 'nozzleTemperatureMax') ??
      definition.nozzleTemperatureMax;
    if (minimum > maximum) {
      throw new BadRequestException(
        'nozzleTemperatureMin cannot exceed nozzleTemperatureMax',
      );
    }
    const trayColor = (
      optionalString(parameters, 'trayColor') ?? definition.trayColor
    ).toUpperCase();

    return {
      print: {
        sequence_id: sourceLocation.kind === 'external' ? '1201' : '1102',
        command: 'ams_filament_setting',
        ams_id:
          sourceLocation.kind === 'external'
            ? externalAmsId
            : sourceLocation.unitId!,
        tray_id:
          sourceLocation.kind === 'external'
            ? externalTrayId
            : sourceLocation.slotId!,
        tray_info_idx: definition.trayInfoIdx,
        tray_color: trayColor,
        nozzle_temp_min: minimum,
        nozzle_temp_max: maximum,
        tray_type: definition.trayType,
      },
    };
  }

  private resolveSource(parameters: CommandParameters): ResolvedSource {
    const kind = string(parameters, 'sourceKind');
    const unitId = optionalNumber(parameters, 'amsUnitId');
    const slotId = optionalNumber(parameters, 'slotId');

    if (kind === 'external') {
      if (!this.topology.externalSpool) {
        throw new BadRequestException(
          'The active printer profile has no external spool',
        );
      }
      if (unitId !== undefined || slotId !== undefined) {
        throw new BadRequestException(
          'External spool source must not include amsUnitId or slotId',
        );
      }
      return { kind };
    }

    if (unitId === undefined || slotId === undefined) {
      throw new BadRequestException('AMS source requires amsUnitId and slotId');
    }
    if (unitId >= this.topology.unitCount) {
      throw new BadRequestException(
        `amsUnitId must be below ${this.topology.unitCount}`,
      );
    }
    if (slotId >= this.topology.slotsPerUnit) {
      throw new BadRequestException(
        `slotId must be below ${this.topology.slotsPerUnit}`,
      );
    }
    return { kind: 'ams', unitId, slotId };
  }

  private filamentSourceParameters(
    extra: CommandDefinition['parameters'],
  ): CommandDefinition['parameters'] {
    return {
      sourceKind: {
        type: 'string',
        required: true,
        values: ['ams', 'external'],
      },
      amsUnitId: { type: 'number', integer: true, minimum: 0 },
      slotId: { type: 'number', integer: true, minimum: 0 },
      ...extra,
    };
  }

  private printAction(
    id: string,
    description: string,
    action: 'pause' | 'resume' | 'stop',
  ): CommandDefinition {
    return this.command(id, description, {}, () => ({
      print: { sequence_id: '0', command: action, param: '' },
    }));
  }

  private moveAbsoluteCommand(): CommandDefinition {
    return this.command(
      'move-absolute',
      'Move one or more axes in absolute coordinate mode',
      {
        x: {
          type: 'number',
          minimum: machineEnvelope.x.minimum,
          maximum: machineEnvelope.x.maximum,
        },
        y: {
          type: 'number',
          minimum: machineEnvelope.y.minimum,
          maximum: machineEnvelope.y.maximum,
        },
        z: {
          type: 'number',
          minimum: machineEnvelope.z.minimum,
          maximum: machineEnvelope.z.maximum,
        },
        feedrate: {
          type: 'number',
          minimum: 1,
          maximum: 30_000,
          default: 3000,
        },
      },
      (parameters) => {
        const axes = ['x', 'y', 'z']
          .filter((axis) => parameters[axis] !== undefined)
          .map((axis) => `${axis.toUpperCase()}${number(parameters, axis)}`);
        if (axes.length === 0) {
          throw new BadRequestException(
            'At least one of x, y or z is required',
          );
        }
        return gcode(
          `G90\nG1 ${axes.join(' ')} F${number(parameters, 'feedrate')}\n`,
        );
      },
      [
        'The A1 profile enforces X/Y 0..256 mm and Z 20..240 mm.',
        'Home the printer before relying on absolute coordinates.',
      ],
    );
  }

  private extrudeRelativeCommand(): CommandDefinition {
    return this.command(
      'extrude-relative',
      'Extrude or retract filament in relative mode',
      {
        millimeters: {
          type: 'number',
          required: true,
          minimum: -50,
          maximum: 50,
        },
        feedrate: {
          type: 'number',
          minimum: 1,
          maximum: 600,
          default: 600,
        },
      },
      (parameters) =>
        gcode(
          `M83\nG1 E${number(parameters, 'millimeters')} F${number(parameters, 'feedrate')}\nM82\n`,
        ),
      ['Heat the nozzle before extruding filament.'],
    );
  }

  private command(
    id: string,
    description: string,
    parameters: CommandDefinition['parameters'],
    build: CommandDefinition['build'],
    safetyNotes?: string[],
  ): CommandDefinition {
    return { id, description, parameters, build, safetyNotes, source };
  }
}

function gcode(line: string): JsonObject {
  return {
    print: { sequence_id: '0', command: 'gcode_line', param: line },
  };
}

/**
 * Extracts the `param` string of a `print.gcode_line` command, the only
 * A1 command shape that can carry free-form motion gcode. Returns undefined
 * for every other payload shape (nothing to inspect).
 */
function extractGcodeLine(payload: JsonObject): string | undefined {
  const print = payload.print;
  if (!isJsonObject(print)) return undefined;
  if (print.command !== 'gcode_line') return undefined;
  return typeof print.param === 'string' ? print.param : undefined;
}

/**
 * Parses absolute-mode (G90) G0/G1 linear moves out of a raw gcode block and
 * returns the last commanded X/Y/Z target for each axis mentioned. Axes not
 * present in any G1/G0 line are omitted (that axis is not moving).
 * Relative-mode (G91) segments are ignored, since they don't set an absolute
 * target this profile can validate against the machine envelope.
 */
function parseAbsoluteMoveTarget(
  gcodeBlock: string,
): { x?: number; y?: number; z?: number } | undefined {
  let mode: 'absolute' | 'relative' = 'absolute';
  const target: { x?: number; y?: number; z?: number } = {};
  let found = false;

  for (const rawLine of gcodeBlock.split('\n')) {
    const line = rawLine.split(';')[0].trim();
    if (!line) continue;
    if (/^G90\b/i.test(line)) {
      mode = 'absolute';
      continue;
    }
    if (/^G91\b/i.test(line)) {
      mode = 'relative';
      continue;
    }
    if (mode !== 'absolute' || !/^G0?1\b/i.test(line)) continue;

    for (const match of line.matchAll(/([XYZ])(-?\d+(?:\.\d+)?)/gi)) {
      const axis = match[1].toLowerCase() as 'x' | 'y' | 'z';
      target[axis] = Number(match[2]);
      found = true;
    }
  }

  return found ? target : undefined;
}

function speedLevel(mode: PrintSpeedMode): string {
  return { silent: '1', standard: '2', sport: '3', ludicrous: '4' }[mode];
}

function string(parameters: CommandParameters, name: string): string {
  return parameters[name] as string;
}

function optionalString(
  parameters: CommandParameters,
  name: string,
): string | undefined {
  return parameters[name] as string | undefined;
}

function number(parameters: CommandParameters, name: string): number {
  return parameters[name] as number;
}

function optionalNumber(
  parameters: CommandParameters,
  name: string,
): number | undefined {
  return parameters[name] as number | undefined;
}

function boolean(parameters: CommandParameters, name: string): boolean {
  return parameters[name] as boolean;
}
