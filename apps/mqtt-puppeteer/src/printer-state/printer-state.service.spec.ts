import type { AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { FilamentCatalogService } from '../filaments/filament-catalog.service';
import { BambuLabA1Mapper } from './bambu-lab-a1.mapper';
import { PrinterStateService } from './printer-state.service';

describe('PrinterStateService', () => {
  const config = {
    stateTemplatePath: undefined,
    filaments: { catalogPath: undefined, catalogMode: 'replace' },
    filamentSystem: {
      amsUnitCount: 1,
      slotsPerUnit: 4,
      externalSpool: true,
    },
  } as AppConfig;
  const createMapper = () =>
    new BambuLabA1Mapper(config, new FilamentCatalogService(config));

  it('deep-merges partial reports and refreshes the domain projection', () => {
    const events = new BridgeEventsService();
    const service = new PrinterStateService(config, createMapper(), events);
    service.onModuleInit();

    events.mqttReports$.next({
      topic: 'device/test/report',
      receivedAt: '2026-07-23T10:00:00.000Z',
      payload: {
        print: {
          nozzle_temper: 201.25,
          online: { rfid: false, version: 1 },
        },
      },
    });
    events.mqttReports$.next({
      topic: 'device/test/report',
      receivedAt: '2026-07-23T10:00:01.000Z',
      payload: { print: { online: { rfid: true } } },
    });

    expect(service.getRaw()).toEqual({
      print: {
        nozzle_temper: 201.25,
        online: { rfid: true, version: 1 },
      },
    });
    expect(service.getDomain()).toHaveProperty(
      'temperatures.nozzle.current',
      201.25,
    );
    expect(service.getSnapshot().updatedAt).toBe('2026-07-23T10:00:01.000Z');
    service.onModuleDestroy();
  });

  it('ignores non-object reports', () => {
    const service = new PrinterStateService(
      config,
      createMapper(),
      new BridgeEventsService(),
    );

    expect(service.applyReport('not-json')).toBe(false);
    expect(service.getRaw()).toEqual({});
  });

  it('returns defensive copies', () => {
    const service = new PrinterStateService(
      config,
      createMapper(),
      new BridgeEventsService(),
    );
    service.applyReport({ print: { mc_percent: 10 } });
    const state = service.getRaw();
    state.print = {};

    expect(service.getRaw()).toHaveProperty('print.mc_percent', 10);
  });
});
