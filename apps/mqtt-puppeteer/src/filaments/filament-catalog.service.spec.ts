import type { AppConfig } from '../config/app-config';
import { FilamentCatalogService } from './filament-catalog.service';

describe('FilamentCatalogService', () => {
  const config = {
    filaments: { catalogPath: undefined, catalogMode: 'replace' },
  } as AppConfig;

  it('resolves a type and brand meta-type to printer filament data', () => {
    const service = new FilamentCatalogService(config);

    expect(service.getResolved('generic-petg')).toEqual({
      id: 'generic-petg',
      displayName: 'Generic PETG',
      filamentTypeId: 'petg',
      filamentBrand: 'Generic',
      trayInfoIdx: 'GFG99',
      trayType: 'PETG',
      trayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 220,
      nozzleTemperatureMax: 270,
    });
  });

  it('returns defensive catalog copies', () => {
    const service = new FilamentCatalogService(config);
    const catalog = service.getCatalog();

    catalog.resolved[0].trayColor = '00000000';

    expect(service.getCatalog().resolved[0].trayColor).toBe('FFFFFFFF');
  });
});
