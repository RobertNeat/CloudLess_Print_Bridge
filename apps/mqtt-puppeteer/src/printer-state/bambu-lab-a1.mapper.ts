import { Injectable } from '@nestjs/common';
import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
import { isJsonObject, type JsonObject } from '../common/json';
import type { PrinterDomainModelMapper } from './printer-domain-model.mapper';

@Injectable()
export class BambuLabA1Mapper implements PrinterDomainModelMapper {
  map(source: JsonObject): PrinterDomainModelDto {
    const print = object(source.print);
    const model: PrinterDomainModelDto = {
      temperatures: {
        nozzle: {
          current: number(print.nozzle_temper),
          target: number(print.nozzle_target_temper),
        },
        bed: {
          current: number(print.bed_temper),
          target: number(print.bed_target_temper),
        },
        chamber: { current: number(print.chamber_temper) },
      },
      job: {
        status: status(print.gcode_state),
        progressPercent: number(print.mc_percent),
        remainingSeconds: multiply(number(print.mc_remaining_time), 60),
        currentLayer: number(print.layer_num),
        totalLayers: number(print.total_layer_num),
        fileName:
          typeof print.gcode_file === 'string' ? print.gcode_file : undefined,
      },
      fans: {
        heatbreakPercent: fanPercent(print.heatbreak_fan_speed),
        coolingPercent: fanPercent(print.cooling_fan_speed),
        auxiliaryPercent: fanPercent(print.big_fan1_speed),
        chamberPercent: fanPercent(print.big_fan2_speed),
      },
      lightOn: chamberLight(print.lights_report),
      speedPercent: number(print.spd_mag),
      amsSlots: amsSlots(print.ams),
      externalSpool: record(print.vt_tray),
    };

    return removeUndefined(model);
  }
}

function object(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isJsonObject(value) ? structuredClone(value) : undefined;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function multiply(
  value: number | undefined,
  factor: number,
): number | undefined {
  return value === undefined ? undefined : Math.round(value * factor);
}

function fanPercent(value: unknown): number | undefined {
  const parsed = number(value);
  return parsed === undefined
    ? undefined
    : Math.max(0, Math.min(100, Math.round((parsed / 15) * 100)));
}

function status(
  value: unknown,
): NonNullable<PrinterDomainModelDto['job']>['status'] {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return undefined;
  }
  const normalized = String(value).toUpperCase();
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

function amsSlots(value: unknown): Record<string, unknown>[] | undefined {
  const ams = object(value).ams;
  if (!Array.isArray(ams)) return undefined;
  const slots = ams.flatMap((unit) => {
    const tray = object(unit).tray;
    return Array.isArray(tray) ? tray.filter(isJsonObject) : [];
  });
  return structuredClone(slots);
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
