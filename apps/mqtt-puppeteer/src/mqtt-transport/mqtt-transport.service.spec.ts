import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { MqttTransportService } from './mqtt-transport.service';
import { OperationTrackerService } from '../operations/operation-tracker.service';
import type { PrinterCommandProfile } from '../printer-profiles/printer-command-profile';

describe('MqttTransportService', () => {
  const config = {
    mqtt: {
      commandTopic: 'device/test/request',
    },
    operations: { timeoutMs: 1_000 },
  } as AppConfig;
  const allowAllProfile = {
    inspectPayload: () => ({ safe: true }),
  } as unknown as PrinterCommandProfile;

  it('emits one failed publication status when MQTT is unavailable', async () => {
    const events = new BridgeEventsService();
    const operations = new OperationTrackerService(config, events);
    const service = new MqttTransportService(
      config,
      events,
      operations,
      allowAllProfile,
    );
    const publication = firstValueFrom(events.mqttPublications$);
    const payload = { print: { command: 'pause' } };

    await expect(
      service.publish(payload, { operationId: 'operation-1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(publication).resolves.toMatchObject({
      operationId: 'operation-1',
      status: 'failed',
      topic: 'device/test/request',
      qos: 0,
      payload: {
        print: {
          command: 'pause',
          sequence_id: 'operation-1',
        },
      },
      error: 'MQTT client is not connected',
    });
  });

  it('rejects a payload the printer profile marks unsafe before publishing', async () => {
    const events = new BridgeEventsService();
    const operations = new OperationTrackerService(config, events);
    const unsafeProfile = {
      inspectPayload: () => ({
        safe: false,
        reason: 'Axis Z target 500 is outside the safe range 20..240',
      }),
    } as unknown as PrinterCommandProfile;
    const service = new MqttTransportService(
      config,
      events,
      operations,
      unsafeProfile,
    );
    const publication = firstValueFrom(events.mqttPublications$);

    await expect(
      service.publish(
        { print: { command: 'gcode_line', param: 'G90\nG1 Z500\n' } },
        { operationId: 'operation-unsafe' },
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(publication).resolves.toMatchObject({
      operationId: 'operation-unsafe',
      status: 'failed',
      error: 'Axis Z target 500 is outside the safe range 20..240',
    });
  });
});
