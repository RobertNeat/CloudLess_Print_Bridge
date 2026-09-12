import type {
  AmsTopologyDto,
  MachineEnvelopeDto,
} from '@cloudless/printer-contracts';
import type { JsonObject } from '../common/json';
import type { CommandDefinition } from '../commands/command.types';

export const PRINTER_COMMAND_PROFILE = Symbol('PRINTER_COMMAND_PROFILE');

/**
 * Outcome of a model-specific payload safety inspection. `safe: false`
 * causes the transport layer to refuse publishing the payload, regardless of
 * which endpoint produced it (catalog command or raw passthrough).
 */
export interface PayloadSafetyResult {
  safe: boolean;
  reason?: string;
  /** Absolute-mode coordinates this payload would move the tool head to, when detected. */
  targetPosition?: { x?: number; y?: number; z?: number };
}

export interface PrinterCommandProfile {
  readonly id: string;
  readonly topology: AmsTopologyDto;
  getCommands(): readonly CommandDefinition[];

  /**
   * The machine's physical travel envelope. Generic (model-agnostic) code
   * must read limits from here instead of hard-coding them, so a different
   * printer profile changes enforcement without touching shared code.
   */
  getMachineEnvelope(): MachineEnvelopeDto;

  /**
   * Inspects a fully-rendered MQTT payload for safety before it is
   * published, independent of how it was produced. This is the hook that
   * closes the raw-passthrough bypass (`POST /commands/raw`): every payload,
   * catalog-built or hand-crafted, passes through here.
   */
  inspectPayload(payload: JsonObject): PayloadSafetyResult;
}
