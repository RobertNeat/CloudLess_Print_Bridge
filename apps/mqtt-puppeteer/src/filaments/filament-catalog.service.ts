import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FilamentCatalogDto,
  FilamentMetaTypeDefinitionDto,
  FilamentTypeDefinitionDto,
  ResolvedFilamentDefinitionDto,
} from '@cloudless/printer-contracts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cloneJson, isJsonObject } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import {
  BAMBU_LAB_A1_FILAMENT_META_TYPES,
  BAMBU_LAB_A1_FILAMENT_TYPES,
} from './bambu-lab-a1-filaments';

interface ExternalFilamentCatalog {
  types: FilamentTypeDefinitionDto[];
  metaTypes: FilamentMetaTypeDefinitionDto[];
}

@Injectable()
export class FilamentCatalogService {
  private readonly types: Map<string, FilamentTypeDefinitionDto>;
  private readonly metaTypes: Map<string, FilamentMetaTypeDefinitionDto>;
  private readonly resolved: Map<string, ResolvedFilamentDefinitionDto>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const external = config.filaments.catalogPath
      ? loadExternalCatalog(config.filaments.catalogPath)
      : undefined;
    const replace =
      Boolean(config.filaments.catalogPath) &&
      config.filaments.catalogMode === 'replace';

    this.types = indexById(
      replace
        ? (external?.types ?? [])
        : [...BAMBU_LAB_A1_FILAMENT_TYPES, ...(external?.types ?? [])],
      validateType,
    );
    this.metaTypes = indexById(
      replace
        ? (external?.metaTypes ?? [])
        : [...BAMBU_LAB_A1_FILAMENT_META_TYPES, ...(external?.metaTypes ?? [])],
      validateMetaType,
    );
    this.resolved = new Map(
      [...this.metaTypes.values()].map((metaType) => {
        const type = this.types.get(metaType.filamentTypeId);
        if (!type) {
          throw new Error(
            `Filament meta-type ${metaType.id} references unknown type ${metaType.filamentTypeId}`,
          );
        }
        const definition = resolveDefinition(type, metaType);
        return [definition.id, definition];
      }),
    );
  }

  getCatalog(): FilamentCatalogDto {
    return {
      types: cloneJson([...this.types.values()]),
      metaTypes: cloneJson([...this.metaTypes.values()]),
      resolved: cloneJson([...this.resolved.values()]),
    };
  }

  listResolved(): ResolvedFilamentDefinitionDto[] {
    return cloneJson([...this.resolved.values()]);
  }

  getResolved(id: string): ResolvedFilamentDefinitionDto {
    const definition = this.resolved.get(id);
    if (!definition) {
      throw new NotFoundException(`Unknown filament definition: ${id}`);
    }
    return cloneJson(definition);
  }
}

function loadExternalCatalog(path: string): ExternalFilamentCatalog {
  const resolvedPath = resolve(path);
  const parsed: unknown = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  if (
    !isJsonObject(parsed) ||
    !Array.isArray(parsed.types) ||
    !Array.isArray(parsed.metaTypes)
  ) {
    throw new Error(
      'Filament catalog must contain types and metaTypes JSON arrays',
    );
  }
  return {
    types: parsed.types as unknown as FilamentTypeDefinitionDto[],
    metaTypes: parsed.metaTypes as unknown as FilamentMetaTypeDefinitionDto[],
  };
}

function indexById<T extends { id: string }>(
  values: readonly T[],
  validate: (value: T) => void,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    validate(value);
    result.set(value.id, cloneJson(value));
  }
  return result;
}

function validateType(value: FilamentTypeDefinitionDto): void {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.trayType !== 'string' ||
    typeof value.defaultTrayColor !== 'string' ||
    typeof value.nozzleTemperatureMin !== 'number' ||
    typeof value.nozzleTemperatureMax !== 'number'
  ) {
    throw new Error('Invalid filament type definition');
  }
  validateColor(value.defaultTrayColor);
  validateTemperatures(
    value.nozzleTemperatureMin,
    value.nozzleTemperatureMax,
    value.id,
  );
}

function validateMetaType(value: FilamentMetaTypeDefinitionDto): void {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.filamentTypeId !== 'string' ||
    typeof value.filamentBrand !== 'string' ||
    typeof value.trayInfoIdx !== 'string'
  ) {
    throw new Error('Invalid filament meta-type definition');
  }
}

function validateColor(color: string): void {
  if (!/^[0-9A-Fa-f]{8}$/.test(color)) {
    throw new Error(`Filament tray color must be RRGGBBAA: ${color}`);
  }
}

function validateTemperatures(minimum: number, maximum: number, id: string) {
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < 0 ||
    maximum < minimum
  ) {
    throw new Error(`Invalid nozzle temperature range for filament ${id}`);
  }
}

function resolveDefinition(
  type: FilamentTypeDefinitionDto,
  metaType: FilamentMetaTypeDefinitionDto,
): ResolvedFilamentDefinitionDto {
  const minimum =
    metaType.nozzleTemperatureMinOverride ?? type.nozzleTemperatureMin;
  const maximum =
    metaType.nozzleTemperatureMaxOverride ?? type.nozzleTemperatureMax;
  validateTemperatures(minimum, maximum, metaType.id);

  return {
    id: metaType.id,
    displayName: `${metaType.filamentBrand} ${type.displayName}`,
    filamentTypeId: type.id,
    filamentBrand: metaType.filamentBrand,
    trayInfoIdx: metaType.trayInfoIdx,
    trayType: type.trayType,
    trayColor: type.defaultTrayColor.toUpperCase(),
    nozzleTemperatureMin: minimum,
    nozzleTemperatureMax: maximum,
  };
}
