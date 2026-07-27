import type { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import type { PrinterStateService } from '../printer-state/printer-state.service';
import { BridgeEventsService } from '../events/bridge-events.service';
import { PrinterGateway } from './printer.gateway';

describe('PrinterGateway', () => {
  const mqtt = {
    getStatus: jest.fn(),
    getLatestReport: jest.fn(),
  } as unknown as MqttTransportService;
  const state = {
    getSnapshot: jest.fn(),
  } as unknown as PrinterStateService;

  it('projects publication statuses and service errors to read-only events', () => {
    const events = new BridgeEventsService();
    const gateway = new PrinterGateway(events, mqtt, state);
    const emit = jest.fn();
    Reflect.set(gateway, 'server', { emit });
    gateway.afterInit();

    events.mqttPublications$.next({
      operationId: 'operation-1',
      status: 'published',
      occurredAt: '2026-07-27T12:00:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      payload: { print: { command: 'pause' } },
    });
    events.serviceErrors$.next({
      operationId: 'operation-1',
      occurredAt: '2026-07-27T12:00:01.000Z',
      source: 'mqtt',
      name: 'Error',
      message: 'connection lost',
    });

    expect(emit).toHaveBeenCalledWith(
      'service.mqtt.publish',
      expect.objectContaining({ status: 'published' }),
    );
    expect(emit).toHaveBeenCalledWith(
      'service.error',
      expect.objectContaining({ message: 'connection lost' }),
    );
    events.operationResults$.next({
      operationId: 'operation-1',
      sequenceId: 'operation-1',
      status: 'acknowledged',
      occurredAt: '2026-07-27T12:00:02.000Z',
    });
    expect(emit).toHaveBeenCalledWith(
      'service.operation.result',
      expect.objectContaining({
        operationId: 'operation-1',
        status: 'acknowledged',
      }),
    );
    gateway.onModuleDestroy();
  });

  it('does not expose command handlers', () => {
    expect(Object.getOwnPropertyNames(PrinterGateway.prototype).sort()).toEqual(
      [
        'afterInit',
        'constructor',
        'emitPrinterState',
        'handleConnection',
        'onModuleDestroy',
        'server',
      ].sort(),
    );
  });
});
