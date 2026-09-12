import type { AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { TelemetryHistoryService } from './telemetry-history.service';

describe('TelemetryHistoryService', () => {
  const config = { telemetry: { historyCapacity: 3 } } as AppConfig;

  it('starts empty', () => {
    const service = new TelemetryHistoryService(
      config,
      new BridgeEventsService(),
    );

    expect(service.getHistory()).toEqual({ capacity: 3, samples: [] });
  });

  it('records a sample derived from the domain model on each state update', () => {
    const events = new BridgeEventsService();
    const service = new TelemetryHistoryService(config, events);
    service.onModuleInit();

    events.printerState$.next({
      updatedAt: '2026-09-12T10:00:00.000Z',
      raw: {},
      domain: {
        job: { progressPercent: 42 },
        temperatures: {
          nozzle: { current: 210, target: 220 },
          bed: { current: 55, target: 60 },
          chamber: { current: 30 },
        },
        fans: { coolingPercent: 80, auxiliaryPercent: 20 },
      },
    });

    expect(service.getHistory()).toEqual({
      capacity: 3,
      samples: [
        {
          capturedAt: '2026-09-12T10:00:00.000Z',
          progressPercent: 42,
          nozzleTemperatureCurrent: 210,
          nozzleTemperatureTarget: 220,
          bedTemperatureCurrent: 55,
          bedTemperatureTarget: 60,
          chamberTemperatureCurrent: 30,
          coolingFanPercent: 80,
          auxiliaryFanPercent: 20,
        },
      ],
    });
  });

  it('fills missing domain fields with null instead of throwing', () => {
    const events = new BridgeEventsService();
    const service = new TelemetryHistoryService(config, events);
    service.onModuleInit();

    events.printerState$.next({
      updatedAt: '2026-09-12T10:00:00.000Z',
      raw: {},
      domain: {},
    });

    expect(service.getHistory().samples[0]).toMatchObject({
      progressPercent: null,
      nozzleTemperatureCurrent: null,
      coolingFanPercent: null,
    });
  });

  it('evicts the oldest sample once capacity is exceeded', () => {
    const events = new BridgeEventsService();
    const service = new TelemetryHistoryService(config, events);
    service.onModuleInit();

    for (let index = 0; index < 5; index += 1) {
      events.printerState$.next({
        updatedAt: `2026-09-12T10:0${index}:00.000Z`,
        raw: {},
        domain: { job: { progressPercent: index } },
      });
    }

    const history = service.getHistory();
    expect(history.samples).toHaveLength(3);
    expect(history.samples.map((sample) => sample.progressPercent)).toEqual([
      2, 3, 4,
    ]);
  });

  it('clears the buffer on demand', () => {
    const events = new BridgeEventsService();
    const service = new TelemetryHistoryService(config, events);
    service.onModuleInit();
    events.printerState$.next({
      updatedAt: '2026-09-12T10:00:00.000Z',
      raw: {},
      domain: { job: { progressPercent: 10 } },
    });

    service.clear();

    expect(service.getHistory().samples).toEqual([]);
  });
});
