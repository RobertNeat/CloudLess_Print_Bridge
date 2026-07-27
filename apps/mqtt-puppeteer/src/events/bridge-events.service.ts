import { Injectable } from '@nestjs/common';
import type {
  PrinterDomainModelDto,
  PrinterOperationResultDto,
} from '@cloudless/printer-contracts';
import { ReplaySubject } from 'rxjs';
import type { JsonObject } from '../common/json';

export interface MqttReport {
  topic: string;
  receivedAt: string;
  payload: unknown;
}

export interface MqttConnectionStatus {
  connected: boolean;
  configured: boolean;
  lastError: string | null;
  subscribedTopic: string | null;
  commandTopic: string | null;
}

export interface PrinterStateUpdated {
  updatedAt: string;
  raw: JsonObject;
  domain: PrinterDomainModelDto;
}

export interface MqttPublicationStatus {
  operationId: string;
  commandId?: string;
  status: 'published' | 'failed';
  occurredAt: string;
  topic: string | null;
  qos: 0;
  payload?: JsonObject;
  error?: string;
}

export interface ServiceErrorEvent {
  operationId?: string;
  occurredAt: string;
  source: 'http' | 'mqtt';
  name: string;
  message: string;
  statusCode?: number;
  method?: string;
  path?: string;
}

@Injectable()
export class BridgeEventsService {
  readonly mqttReports$ = new ReplaySubject<MqttReport>(1);
  readonly mqttStatus$ = new ReplaySubject<MqttConnectionStatus>(1);
  readonly printerState$ = new ReplaySubject<PrinterStateUpdated>(1);
  readonly mqttPublications$ = new ReplaySubject<MqttPublicationStatus>(1);
  readonly serviceErrors$ = new ReplaySubject<ServiceErrorEvent>(1);
  readonly operationResults$ = new ReplaySubject<PrinterOperationResultDto>(1);

  emitMqttError(error: Error): void {
    this.serviceErrors$.next({
      occurredAt: new Date().toISOString(),
      source: 'mqtt',
      name: error.name,
      message: error.message,
    });
  }
}
