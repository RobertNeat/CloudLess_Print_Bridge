import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrinterOperationResultDto } from '@cloudless/printer-contracts';
import { Subscription } from 'rxjs';
import { isJsonObject, type JsonObject } from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';

export interface OperationDescriptor {
  operationId: string;
  sequenceId: string;
  commandId?: string;
}

interface PendingOperation extends OperationDescriptor {
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class OperationTrackerService implements OnModuleInit, OnModuleDestroy {
  private readonly pending = new Map<string, PendingOperation>();
  private readonly subscription = new Subscription();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: BridgeEventsService,
  ) {}

  onModuleInit(): void {
    this.subscription.add(
      this.events.mqttReports$.subscribe((report) =>
        this.correlate(report.payload),
      ),
    );
  }

  begin(descriptor: OperationDescriptor): void {
    if (this.pending.has(descriptor.operationId)) return;
    const timer = setTimeout(
      () => this.finish(descriptor.operationId, 'timed_out'),
      this.config.operations.timeoutMs,
    );
    this.pending.set(descriptor.operationId, { ...descriptor, timer });
  }

  reject(operationId: string, error: string): void {
    this.finish(operationId, 'rejected', error);
  }

  onModuleDestroy(): void {
    this.subscription.unsubscribe();
    for (const operationId of this.pending.keys()) this.clear(operationId);
  }

  private correlate(payload: unknown): void {
    for (const operation of this.pending.values()) {
      const response = findSequenceResponse(payload, operation.sequenceId);
      if (!response) continue;
      const rejection = rejectionMessage(response);
      this.finish(
        operation.operationId,
        rejection ? 'rejected' : 'acknowledged',
        rejection,
        response,
      );
    }
  }

  private finish(
    operationId: string,
    status: PrinterOperationResultDto['status'],
    error?: string,
    response?: JsonObject,
  ): void {
    const operation = this.pending.get(operationId);
    if (!operation) return;
    this.clear(operationId);
    this.events.operationResults$.next({
      operationId,
      sequenceId: operation.sequenceId,
      commandId: operation.commandId,
      status,
      occurredAt: new Date().toISOString(),
      error,
      response: response ? structuredClone(response) : undefined,
    });
  }

  private clear(operationId: string): void {
    const operation = this.pending.get(operationId);
    if (operation) clearTimeout(operation.timer);
    this.pending.delete(operationId);
  }
}

function findSequenceResponse(
  value: unknown,
  sequenceId: string,
): JsonObject | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findSequenceResponse(entry, sequenceId);
      if (match) return match;
    }
    return undefined;
  }
  if (!isJsonObject(value)) return undefined;
  if (primitiveString(value.sequence_id) === sequenceId) return value;
  for (const entry of Object.values(value)) {
    const match = findSequenceResponse(entry, sequenceId);
    if (match) return match;
  }
  return undefined;
}

function rejectionMessage(response: JsonObject): string | undefined {
  const result =
    typeof response.result === 'string'
      ? response.result.trim().toLowerCase()
      : undefined;
  if (
    result &&
    ['fail', 'failed', 'failure', 'error', 'rejected'].includes(result)
  ) {
    return stringValue(response.reason) ?? `Device returned result: ${result}`;
  }
  const errorCode = response.error_code;
  const errorCodeText = primitiveString(errorCode)?.trim();
  if (
    errorCodeText !== undefined &&
    errorCodeText !== '' &&
    errorCodeText !== '0'
  ) {
    return `Device returned error_code: ${errorCodeText}`;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function primitiveString(value: unknown): string | undefined {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : undefined;
}
