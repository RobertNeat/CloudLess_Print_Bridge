import { Injectable } from '@nestjs/common';
import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
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

@Injectable()
export class BridgeEventsService {
  readonly mqttReports$ = new ReplaySubject<MqttReport>(1);
  readonly mqttStatus$ = new ReplaySubject<MqttConnectionStatus>(1);
  readonly printerState$ = new ReplaySubject<PrinterStateUpdated>(1);
}
