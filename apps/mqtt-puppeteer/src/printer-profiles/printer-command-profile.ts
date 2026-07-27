import type { AmsTopologyDto } from '@cloudless/printer-contracts';
import type { CommandDefinition } from '../commands/command.types';

export const PRINTER_COMMAND_PROFILE = Symbol('PRINTER_COMMAND_PROFILE');

export interface PrinterCommandProfile {
  readonly id: string;
  readonly topology: AmsTopologyDto;
  getCommands(): readonly CommandDefinition[];
}
