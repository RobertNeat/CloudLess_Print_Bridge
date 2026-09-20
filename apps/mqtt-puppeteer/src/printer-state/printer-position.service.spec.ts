import { BridgeEventsService } from '../events/bridge-events.service';
import type { PrinterCommandProfile } from '../printer-profiles/printer-command-profile';
import { PrinterPositionService } from './printer-position.service';

describe('PrinterPositionService', () => {
  const profile = {
    getMachineEnvelope: () => ({
      x: { minimum: 0, maximum: 256 },
      y: { minimum: 0, maximum: 256 },
      z: { minimum: 20, maximum: 240 },
    }),
    inspectPayload: (payload: unknown) => {
      const gcode =
        typeof payload === 'object' &&
        payload !== null &&
        'print' in payload &&
        typeof (payload as { print?: { param?: unknown } }).print?.param ===
          'string'
          ? (payload as { print: { param: string } }).print.param
          : undefined;
      if (!gcode) return { safe: true };
      const match = /G1 (?:X(-?\d+))? ?(?:Y(-?\d+))? ?(?:Z(-?\d+))?/.exec(
        gcode,
      );
      if (!match) return { safe: true };
      const targetPosition = {
        x: match[1] !== undefined ? Number(match[1]) : undefined,
        y: match[2] !== undefined ? Number(match[2]) : undefined,
        z: match[3] !== undefined ? Number(match[3]) : undefined,
      };
      return { safe: true, targetPosition };
    },
  } as unknown as PrinterCommandProfile;

  const createService = (events: BridgeEventsService) => {
    const service = new PrinterPositionService(events, profile);
    service.onModuleInit();
    return service;
  };

  it('reports an unknown position before anything has been commanded', () => {
    const events = new BridgeEventsService();
    const service = createService(events);

    expect(service.getPosition()).toEqual({
      x: null,
      y: null,
      z: null,
      homed: false,
      source: 'unknown',
      updatedAt: null,
    });
  });

  it('seeds a homed position from a successfully published home command', () => {
    const events = new BridgeEventsService();
    const service = createService(events);

    events.mqttPublications$.next({
      operationId: 'op-1',
      commandId: 'home',
      status: 'published',
      occurredAt: '2026-09-12T10:00:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      payload: { print: { command: 'gcode_line', param: 'G28\n' } },
    });

    expect(service.getPosition()).toEqual({
      x: 128,
      y: 128,
      z: 10,
      homed: true,
      source: 'homed',
      updatedAt: '2026-09-12T10:00:00.000Z',
    });
  });

  it('tracks a commanded absolute move within the machine envelope', () => {
    const events = new BridgeEventsService();
    const service = createService(events);

    events.mqttPublications$.next({
      operationId: 'op-2',
      commandId: 'move-absolute',
      status: 'published',
      occurredAt: '2026-09-12T10:01:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      payload: {
        print: {
          command: 'gcode_line',
          param: 'G90\nG1 X125 Y125 Z20 F3000\n',
        },
      },
    });

    expect(service.getPosition()).toMatchObject({
      x: 125,
      y: 125,
      z: 20,
      source: 'commanded',
    });
  });

  it('clamps a tracked target to the machine envelope even if profile math drifts', () => {
    const events = new BridgeEventsService();
    const service = createService(events);

    events.mqttPublications$.next({
      operationId: 'op-3',
      commandId: 'move-absolute',
      status: 'published',
      occurredAt: '2026-09-12T10:02:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      payload: {
        print: { command: 'gcode_line', param: 'G90\nG1 X999\n' },
      },
    });

    expect(service.getPosition().x).toBe(256);
  });

  it('invalidates the tracked position when the MQTT connection drops', () => {
    const events = new BridgeEventsService();
    const service = createService(events);
    events.mqttPublications$.next({
      operationId: 'op-4',
      commandId: 'home',
      status: 'published',
      occurredAt: '2026-09-12T10:03:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      payload: { print: { command: 'gcode_line', param: 'G28\n' } },
    });

    events.mqttStatus$.next({
      connected: false,
      configured: true,
      lastError: 'connection lost',
      subscribedTopic: 'device/test/report',
      commandTopic: 'device/test/request',
    });

    expect(service.getPosition()).toMatchObject({
      x: null,
      y: null,
      z: null,
      homed: false,
      source: 'unknown',
    });
  });

  it('ignores failed publications', () => {
    const events = new BridgeEventsService();
    const service = createService(events);

    events.mqttPublications$.next({
      operationId: 'op-5',
      commandId: 'move-absolute',
      status: 'failed',
      occurredAt: '2026-09-12T10:04:00.000Z',
      topic: 'device/test/request',
      qos: 0,
      error: 'MQTT client is not connected',
    });

    expect(service.getPosition().source).toBe('unknown');
  });
});
