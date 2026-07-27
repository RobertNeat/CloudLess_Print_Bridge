export type PrinterOperationTerminalStatus =
  | 'acknowledged'
  | 'rejected'
  | 'timed_out';

export interface PrinterOperationResultDto {
  operationId: string;
  sequenceId: string;
  commandId?: string;
  status: PrinterOperationTerminalStatus;
  occurredAt: string;
  error?: string;
  response?: unknown;
}
