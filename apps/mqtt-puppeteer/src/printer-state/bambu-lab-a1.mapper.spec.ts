import type { AppConfig } from '../config/app-config';
import { FilamentCatalogService } from '../filaments/filament-catalog.service';
import { BambuLabA1Mapper } from './bambu-lab-a1.mapper';

describe('BambuLabA1Mapper', () => {
  const config = {
    filaments: { catalogPath: undefined, catalogMode: 'replace' },
    filamentSystem: {
      amsUnitCount: 1,
      slotsPerUnit: 4,
      externalSpool: true,
    },
  } as AppConfig;
  const mapper = new BambuLabA1Mapper(
    config,
    new FilamentCatalogService(config),
  );

  it('rejects empty, boolean, non-finite and out-of-range measurements', () => {
    const domain = mapper.map({
      print: {
        nozzle_temper: null,
        bed_temper: '',
        chamber_temper: false,
        mc_percent: 101,
        layer_num: '1.5',
        total_layer_num: '20',
        spd_mag: 'Infinity',
      },
    });

    expect(domain.temperatures).toEqual({
      nozzle: {},
      bed: {},
      chamber: {},
    });
    expect(domain.job).toMatchObject({ totalLayers: 20 });
    expect(domain.job).not.toHaveProperty('progressPercent');
    expect(domain.job).not.toHaveProperty('currentLayer');
    expect(domain).not.toHaveProperty('speedPercent');
  });

  it('maps AMS units, slots and external spool to stable domain contracts', () => {
    const domain = mapper.map({
      print: {
        ams: {
          tray_now: '2',
          ams: [
            {
              id: '0',
              humidity: '42',
              temp: '24.5',
              tray_exist_bits: '5',
              tray: [
                {
                  id: '0',
                  tray_info_idx: 'GFL99',
                  tray_type: 'PLA',
                  tray_color: '11223344',
                  remain: '80',
                  nozzle_temp_min: '190',
                  nozzle_temp_max: '240',
                },
                { id: '1' },
                {
                  id: '2',
                  tray_info_idx: 'GFG99',
                  tray_type: 'PETG',
                  tray_color: 'AABBCCDD',
                },
              ],
            },
          ],
        },
        vt_tray: {
          tray_info_idx: 'GFA00',
          tray_type: 'PLA',
          tray_color: 'FFFFFFFF',
          nozzle_temp_min: '190',
          nozzle_temp_max: '240',
        },
      },
    });

    expect(domain.ams).toEqual({
      units: [
        {
          id: 'ams-unit-0',
          position: 0,
          humidityPercent: 42,
          temperatureCelsius: 24.5,
          slots: [
            {
              id: 'ams-unit-0-slot-0',
              unitId: 'ams-unit-0',
              position: 0,
              occupied: true,
              active: false,
              filament: {
                id: 'generic-pla',
                displayName: 'Generic PLA',
                type: 'PLA',
                brand: 'Generic',
              },
              color: '11223344',
              remainingPercent: 80,
              nozzleTemperatureMin: 190,
              nozzleTemperatureMax: 240,
            },
            {
              id: 'ams-unit-0-slot-1',
              unitId: 'ams-unit-0',
              position: 1,
              occupied: false,
              active: false,
            },
            {
              id: 'ams-unit-0-slot-2',
              unitId: 'ams-unit-0',
              position: 2,
              occupied: true,
              active: true,
              filament: {
                id: 'generic-petg',
                displayName: 'Generic PETG',
                type: 'PETG',
                brand: 'Generic',
              },
              color: 'AABBCCDD',
              nozzleTemperatureMin: 220,
              nozzleTemperatureMax: 270,
            },
            {
              id: 'ams-unit-0-slot-3',
              unitId: 'ams-unit-0',
              position: 3,
              occupied: false,
              active: false,
            },
          ],
        },
      ],
      externalSpool: {
        id: 'external-spool',
        occupied: true,
        active: false,
        filament: {
          id: 'bambu-lab-pla',
          displayName: 'Bambu Lab PLA',
          type: 'PLA',
          brand: 'Bambu Lab',
        },
        color: 'FFFFFFFF',
        nozzleTemperatureMin: 190,
        nozzleTemperatureMax: 240,
      },
      activeSourceId: 'ams-unit-0-slot-2',
    });
  });
});
