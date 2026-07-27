import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { OperationTrackerService } from './operation-tracker.service';

describe('OperationTrackerService', () => {
  const config = { operations: { timeoutMs: 1_000 } } as AppConfig;

  it.each([
    ['success', 'acknowledged'],
    ['failed', 'rejected'],
  ] as const)('maps a %s device response to %s', async (result, status) => {
    const events = new BridgeEventsService();
    const tracker = new OperationTrackerService(config, events);
    tracker.onModuleInit();
    tracker.begin({
      operationId: 'operation-1',
      sequenceId: 'operation-1',
      commandId: 'pause-print',
    });
    const terminal = firstValueFrom(events.operationResults$);

    events.mqttReports$.next({
      topic: 'device/test/report',
      receivedAt: '2026-07-27T12:00:00.000Z',
      payload: {
        print: {
          sequence_id: 'operation-1',
          result,
          reason: result === 'failed' ? 'printer busy' : undefined,
        },
      },
    });

    await expect(terminal).resolves.toMatchObject({
      operationId: 'operation-1',
      sequenceId: 'operation-1',
      commandId: 'pause-print',
      status,
      ...(status === 'rejected' ? { error: 'printer busy' } : {}),
    });
    tracker.onModuleDestroy();
  });

  it('emits timed_out when the device does not echo the sequence id', async () => {
    jest.useFakeTimers();
    const events = new BridgeEventsService();
    const tracker = new OperationTrackerService(config, events);
    tracker.onModuleInit();
    tracker.begin({
      operationId: 'operation-2',
      sequenceId: 'operation-2',
    });
    const terminal = firstValueFrom(events.operationResults$);

    jest.advanceTimersByTime(1_000);

    await expect(terminal).resolves.toMatchObject({
      operationId: 'operation-2',
      status: 'timed_out',
    });
    tracker.onModuleDestroy();
    jest.useRealTimers();
  });
});
