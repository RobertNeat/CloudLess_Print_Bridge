import { Inject, Injectable } from '@nestjs/common';
import type {
  AmsFilamentDto,
  AmsSlotDto,
  AmsSystemDto,
  AmsUnitDto,
  ExternalSpoolDto,
  PrinterDomainModelDto,
  ResolvedFilamentDefinitionDto,
} from '@cloudless/printer-contracts';
import { isJsonObject, type JsonObject } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { FilamentCatalogService } from '../filaments/filament-catalog.service';
import type { PrinterDomainModelMapper } from './printer-domain-model.mapper';

const externalTrayTarget = 254;

@Injectable()
export class BambuLabA1Mapper implements PrinterDomainModelMapper {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly filaments: FilamentCatalogService,
  ) {}

  map(source: JsonObject): PrinterDomainModelDto {
    const print = object(source.print);
    const model: PrinterDomainModelDto = {
      temperatures: {
        nozzle: {
          current: temperature(print.nozzle_temper, -20, 500),
          target: temperature(print.nozzle_target_temper, 0, 500),
        },
        bed: {
          current: temperature(print.bed_temper, -20, 150),
          target: temperature(print.bed_target_temper, 0, 150),
        },
        chamber: {
          current: temperature(print.chamber_temper, -50, 100),
        },
      },
      job: {
        status: status(print.gcode_state),
        progressPercent: percentage(print.mc_percent),
        remainingSeconds: multiply(
          finiteNumber(print.mc_remaining_time, 0, 525_600),
          60,
        ),
        currentLayer: integer(print.layer_num, 0, 10_000_000),
        totalLayers: integer(print.total_layer_num, 0, 10_000_000),
        fileName: nonEmptyString(print.gcode_file),
      },
      fans: {
        heatbreakPercent: fanPercent(print.heatbreak_fan_speed),
        coolingPercent: fanPercent(print.cooling_fan_speed),
        auxiliaryPercent: fanPercent(print.big_fan1_speed),
        chamberPercent: fanPercent(print.big_fan2_speed),
      },
      lightOn: chamberLight(print.lights_report),
      speedPercent: finiteNumber(print.spd_mag, 0, 1_000),
      ams: mapAms(
        print.ams,
        print.vt_tray,
        this.config.filamentSystem.slotsPerUnit,
        this.filaments,
      ),
    };

    return removeUndefined(model);
  }
}

function mapAms(
  rawAms: unknown,
  rawExternalSpool: unknown,
  slotsPerUnit: number,
  filaments: FilamentCatalogService,
): AmsSystemDto | undefined {
  const ams = object(rawAms);
  const rawUnits = Array.isArray(ams.ams) ? ams.ams : [];
  const activeTarget = integer(ams.tray_now, 0, 255);
  const units = rawUnits
    .filter(isJsonObject)
    .map((unit, index) =>
      mapAmsUnit(unit, index, activeTarget, slotsPerUnit, filaments),
    );
  const externalSpool = isJsonObject(rawExternalSpool)
    ? mapExternalSpool(rawExternalSpool, activeTarget, filaments)
    : undefined;
  if (units.length === 0 && !externalSpool) return undefined;

  const activeSlot = units
    .flatMap((unit) => unit.slots)
    .find((slot) => slot.active);
  return removeUndefined({
    units,
    externalSpool,
    activeSourceId:
      activeSlot?.id ?? (externalSpool?.active ? externalSpool.id : undefined),
  });
}

function mapAmsUnit(
  raw: JsonObject,
  fallbackPosition: number,
  activeTarget: number | undefined,
  slotsPerUnit: number,
  filaments: FilamentCatalogService,
): AmsUnitDto {
  const position = integer(raw.id, 0, 255) ?? fallbackPosition;
  const unitId = `ams-unit-${position}`;
  const trays = Array.isArray(raw.tray) ? raw.tray.filter(isJsonObject) : [];
  const occupiedBits = bitmask(raw.tray_exist_bits);
  const slotCount = Math.max(slotsPerUnit, trays.length);

  return removeUndefined({
    id: unitId,
    position,
    humidityPercent: percentage(raw.humidity),
    temperatureCelsius: temperature(raw.temp, -50, 100),
    slots: Array.from({ length: slotCount }, (_, slotPosition) => {
      const tray =
        trays.find(
          (candidate) => integer(candidate.id, 0, 255) === slotPosition,
        ) ??
        (integer(trays[slotPosition]?.id, 0, 255) === undefined
          ? trays[slotPosition]
          : undefined) ??
        {};
      return mapAmsSlot(
        tray,
        slotPosition,
        unitId,
        position,
        activeTarget,
        slotsPerUnit,
        occupiedBits,
        filaments,
      );
    }),
  });
}

function mapAmsSlot(
  raw: JsonObject,
  fallbackPosition: number,
  unitId: string,
  unitPosition: number,
  activeTarget: number | undefined,
  slotsPerUnit: number,
  occupiedBits: number | undefined,
  filaments: FilamentCatalogService,
): AmsSlotDto {
  const position = integer(raw.id, 0, 255) ?? fallbackPosition;
  const definition = resolvedFilament(raw, filaments);
  const filament = mapFilament(raw, definition);
  const trayColor = color(raw.tray_color) ?? definition?.trayColor;
  const occupied =
    occupiedBits === undefined
      ? Boolean(filament || trayColor)
      : Math.floor(occupiedBits / 2 ** position) % 2 === 1;
  return removeUndefined({
    id: `${unitId}-slot-${position}`,
    unitId,
    position,
    occupied,
    active: activeTarget === unitPosition * slotsPerUnit + position,
    filament,
    color: trayColor,
    remainingPercent: percentage(raw.remain),
    nozzleTemperatureMin:
      temperature(raw.nozzle_temp_min, 0, 500) ??
      definition?.nozzleTemperatureMin,
    nozzleTemperatureMax:
      temperature(raw.nozzle_temp_max, 0, 500) ??
      definition?.nozzleTemperatureMax,
  });
}

function mapExternalSpool(
  raw: JsonObject,
  activeTarget: number | undefined,
  filaments: FilamentCatalogService,
): ExternalSpoolDto {
  const definition = resolvedFilament(raw, filaments);
  const filament = mapFilament(raw, definition);
  const trayColor = color(raw.tray_color) ?? definition?.trayColor;
  return removeUndefined({
    id: 'external-spool',
    occupied: Boolean(filament || trayColor),
    active: activeTarget === externalTrayTarget,
    filament,
    color: trayColor,
    nozzleTemperatureMin:
      temperature(raw.nozzle_temp_min, 0, 500) ??
      definition?.nozzleTemperatureMin,
    nozzleTemperatureMax:
      temperature(raw.nozzle_temp_max, 0, 500) ??
      definition?.nozzleTemperatureMax,
  });
}

function mapFilament(
  raw: JsonObject,
  resolved: ResolvedFilamentDefinitionDto | undefined,
): AmsFilamentDto | undefined {
  const type = nonEmptyString(raw.tray_type) ?? resolved?.trayType;
  if (!resolved && !type) return undefined;
  return removeUndefined({
    id: resolved?.id,
    displayName: resolved?.displayName,
    type,
    brand: resolved?.filamentBrand,
  });
}

function resolvedFilament(
  raw: JsonObject,
  filaments: FilamentCatalogService,
): ResolvedFilamentDefinitionDto | undefined {
  const trayInfoIdx = nonEmptyString(raw.tray_info_idx);
  return trayInfoIdx
    ? filaments.findResolvedByTrayInfoIdx(trayInfoIdx)
    : undefined;
}

function object(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : undefined;
  return parsed !== undefined &&
    Number.isFinite(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : undefined;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = finiteNumber(value, minimum, maximum);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function bitmask(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const normalized = value.trim();
  const radix = /[a-f]/i.test(normalized) ? 16 : 10;
  if (
    (radix === 16 && !/^[0-9a-f]+$/i.test(normalized)) ||
    (radix === 10 && !/^[0-9]+$/.test(normalized))
  ) {
    return undefined;
  }
  const parsed = Number.parseInt(normalized, radix);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function temperature(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return finiteNumber(value, minimum, maximum);
}

function percentage(value: unknown): number | undefined {
  return finiteNumber(value, 0, 100);
}

function multiply(
  value: number | undefined,
  factor: number,
): number | undefined {
  return value === undefined ? undefined : Math.round(value * factor);
}

function fanPercent(value: unknown): number | undefined {
  const parsed = finiteNumber(value, 0, 15);
  return parsed === undefined ? undefined : Math.round((parsed / 15) * 100);
}

function status(
  value: unknown,
): NonNullable<PrinterDomainModelDto['job']>['status'] {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'RUNNING') return 'running';
  if (normalized === 'PAUSE' || normalized === 'PAUSED') return 'paused';
  if (normalized === 'FINISH' || normalized === 'FINISHED') return 'finished';
  if (normalized === 'FAILED' || normalized === 'ERROR') return 'error';
  if (normalized === 'IDLE') return 'idle';
  return normalized ? 'unknown' : undefined;
}

function chamberLight(value: unknown): boolean | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: unknown[] = value;
  const light = entries.find(
    (entry) => isJsonObject(entry) && entry.node === 'chamber_light',
  );
  return isJsonObject(light) ? light.mode === 'on' : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function color(value: unknown): string | undefined {
  const candidate = nonEmptyString(value)?.toUpperCase();
  if (!candidate) return undefined;
  if (/^[0-9A-F]{8}$/.test(candidate)) return candidate;
  if (/^[0-9A-F]{6}$/.test(candidate)) return `${candidate}FF`;
  return undefined;
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map(removeUndefined)
      .filter((entry) => entry !== undefined) as T;
  }
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)]),
  ) as T;
}
