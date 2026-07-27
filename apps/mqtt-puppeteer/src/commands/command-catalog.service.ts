import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cloneJson,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import {
  PRINTER_COMMAND_PROFILE,
  type PrinterCommandProfile,
} from '../printer-profiles/printer-command-profile';
import type {
  CommandDefinition,
  CommandParameterDefinition,
  CommandParameters,
  JsonCommandDefinition,
} from './command.types';
import { applyOperationSequence } from '../operations/operation-payload';
import { OperationTrackerService } from '../operations/operation-tracker.service';

@Injectable()
export class CommandCatalogService {
  private readonly commands: Map<string, CommandDefinition>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly mqtt: MqttTransportService,
    @Inject(PRINTER_COMMAND_PROFILE)
    private readonly profile: PrinterCommandProfile,
    private readonly operations: OperationTrackerService,
  ) {
    const builtIn = [...profile.getCommands()];
    const external = config.commands.catalogPath
      ? loadJsonCatalog(config.commands.catalogPath)
      : [];
    const selected =
      config.commands.catalogPath && config.commands.catalogMode === 'replace'
        ? external
        : [...builtIn, ...external];
    this.commands = new Map(
      selected.map((definition) => [definition.id, definition]),
    );
  }

  getProfile() {
    return {
      id: this.profile.id,
      topology: cloneJson(this.profile.topology),
    };
  }

  list() {
    return [...this.commands.values()].map((definition) =>
      cloneJson({
        id: definition.id,
        description: definition.description,
        parameters: definition.parameters,
        safetyNotes: definition.safetyNotes,
        source: definition.source,
      }),
    );
  }

  build(id: string, input: unknown): JsonObject {
    const definition = this.commands.get(id);
    if (!definition) throw new NotFoundException(`Unknown command: ${id}`);
    if (input !== undefined && !isJsonObject(input)) {
      throw new BadRequestException('Command parameters must be a JSON object');
    }
    const parameters = validateParameters(definition.parameters, input ?? {});
    return definition.build(parameters);
  }

  preview(id: string, input: unknown, operationId?: string) {
    const payload = this.build(id, input);
    return {
      ...(operationId ? { operationId } : {}),
      commandId: id,
      payload: operationId
        ? applyOperationSequence(payload, operationId)
        : payload,
    };
  }

  async execute(id: string, input: unknown, operationId: string) {
    this.operations.begin({
      operationId,
      sequenceId: operationId,
      commandId: id,
    });
    try {
      const payload = this.build(id, input);
      const result = await this.mqtt.publish(payload, {
        operationId,
        commandId: id,
      });
      return { ...result, commandId: id };
    } catch (error) {
      this.operations.reject(
        operationId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}

function loadJsonCatalog(path: string): CommandDefinition[] {
  const resolved = resolve(path);
  const parsed: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Command catalog must contain a JSON array');
  }

  return parsed.map((entry, index) => {
    if (!isJsonCommand(entry)) {
      throw new Error(`Invalid command catalog entry at index ${index}`);
    }
    const definition = cloneJson(entry);
    return {
      id: definition.id,
      description: definition.description,
      parameters: definition.parameters ?? {},
      safetyNotes: definition.safetyNotes,
      source: `file:${resolved}`,
      build: (parameters) =>
        renderTemplate(definition.payload, parameters) as JsonObject,
    };
  });
}

function isJsonCommand(value: unknown): value is JsonCommandDefinition {
  return (
    isJsonObject(value) &&
    typeof value.id === 'string' &&
    typeof value.description === 'string' &&
    isJsonObject(value.payload) &&
    (value.parameters === undefined || isJsonObject(value.parameters))
  );
}

function validateParameters(
  definitions: Record<string, CommandParameterDefinition>,
  input: CommandParameters,
): CommandParameters {
  const unknown = Object.keys(input).filter((key) => !(key in definitions));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown parameters: ${unknown.join(', ')}`);
  }

  return Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const value = input[name] ?? definition.default;
      if (value === undefined) {
        if (definition.required) {
          throw new BadRequestException(`Missing required parameter: ${name}`);
        }
        return [name, undefined];
      }
      if (typeof value !== definition.type) {
        throw new BadRequestException(
          `Parameter ${name} must be a ${definition.type}`,
        );
      }
      if (definition.values && !definition.values.includes(value as never)) {
        throw new BadRequestException(
          `Parameter ${name} must be one of: ${definition.values
            .map((entry) => JSON.stringify(entry))
            .join(', ')}`,
        );
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new BadRequestException(`Parameter ${name} must be finite`);
        }
        if (definition.integer && !Number.isInteger(value)) {
          throw new BadRequestException(`Parameter ${name} must be an integer`);
        }
        if (definition.minimum !== undefined && value < definition.minimum) {
          throw new BadRequestException(
            `Parameter ${name} must be at least ${definition.minimum}`,
          );
        }
        if (definition.maximum !== undefined && value > definition.maximum) {
          throw new BadRequestException(
            `Parameter ${name} must be at most ${definition.maximum}`,
          );
        }
      }
      if (
        typeof value === 'string' &&
        definition.pattern &&
        !new RegExp(definition.pattern).test(value)
      ) {
        throw new BadRequestException(
          `Parameter ${name} does not match ${definition.pattern}`,
        );
      }
      return [name, value];
    }),
  );
}

function renderTemplate(
  value: JsonValue,
  parameters: CommandParameters,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => renderTemplate(entry, parameters));
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        renderTemplate(entry, parameters),
      ]),
    );
  }
  if (typeof value !== 'string') return value;

  const exact = value.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
  if (exact) return cloneJson(parameters[exact[1]] as JsonValue);
  return value.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_match, name: string) =>
    templateString(parameters[name]),
  );
}

function templateString(value: unknown): string {
  return ['string', 'number', 'boolean'].includes(typeof value)
    ? String(value)
    : '';
}
