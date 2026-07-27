import { ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { MqttTransportService } from './mqtt-transport.service';
import { OperationTrackerService } from '../operations/operation-tracker.service';

describe('MqttTransportService', () => {
  const config = {
    mqtt: {
      commandTopic: 'device/test/request',
    },
    operations: { timeoutMs: 1_000 },
  } as AppConfig;

  it('emits one failed publication status when MQTT is unavailable', async () => {
    const events = new BridgeEventsService();
    const operations = new OperationTrackerService(config, events);
    const service = new MqttTransportService(config, events, operations);
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
});
