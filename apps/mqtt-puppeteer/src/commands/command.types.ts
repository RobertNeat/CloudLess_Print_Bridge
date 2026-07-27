import type { JsonObject, JsonValue } from '../common/json';

export type CommandParameters = Record<string, unknown>;

export interface CommandParameterDefinition {
  type: 'number' | 'string' | 'boolean';
  required?: boolean;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  values?: Array<string | number | boolean | null>;
  pattern?: string;
  default?: JsonValue;
  description?: string;
}

export interface CommandDefinition {
  id: string;
  description: string;
  parameters: Record<string, CommandParameterDefinition>;
  safetyNotes?: string[];
  source: string;
  build(parameters: CommandParameters): JsonObject;
}

export interface JsonCommandDefinition {
  id: string;
  description: string;
  parameters?: Record<string, CommandParameterDefinition>;
  safetyNotes?: string[];
  payload: JsonObject;
}
