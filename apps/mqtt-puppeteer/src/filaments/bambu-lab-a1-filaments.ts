import type {
  FilamentMetaTypeDefinitionDto,
  FilamentTypeDefinitionDto,
} from '@cloudless/printer-contracts';

export const BAMBU_LAB_A1_FILAMENT_TYPES: readonly FilamentTypeDefinitionDto[] =
  [
    {
      id: 'pla',
      displayName: 'PLA',
      trayType: 'PLA',
      defaultTrayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 190,
      nozzleTemperatureMax: 240,
    },
    {
      id: 'pla-cf',
      displayName: 'PLA-CF',
      trayType: 'PLA-CF',
      defaultTrayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 210,
      nozzleTemperatureMax: 250,
    },
    {
      id: 'abs',
      displayName: 'ABS',
      trayType: 'ABS',
      defaultTrayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 240,
      nozzleTemperatureMax: 280,
    },
    {
      id: 'petg',
      displayName: 'PETG',
      trayType: 'PETG',
      defaultTrayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 230,
      nozzleTemperatureMax: 270,
    },
    {
      id: 'tpu',
      displayName: 'TPU',
      trayType: 'TPU',
      defaultTrayColor: 'FFFFFFFF',
      nozzleTemperatureMin: 200,
      nozzleTemperatureMax: 250,
    },
  ];

export const BAMBU_LAB_A1_FILAMENT_META_TYPES: readonly FilamentMetaTypeDefinitionDto[] =
  [
    meta('bambu-lab-pla', 'pla', 'Bambu Lab', 'GFA00'),
    meta('bambu-lab-pla-cf', 'pla-cf', 'Bambu Lab', 'GFA50'),
    meta('bambu-lab-abs', 'abs', 'Bambu Lab', 'GFB00'),
    meta('bambu-lab-petg', 'petg', 'Bambu Lab', 'GFG00'),
    meta('bambu-lab-tpu', 'tpu', 'Bambu Lab', 'GFU01'),
    meta('generic-pla', 'pla', 'Generic', 'GFL99'),
    meta('generic-abs', 'abs', 'Generic', 'GFB99'),
    {
      ...meta('generic-petg', 'petg', 'Generic', 'GFG99'),
      nozzleTemperatureMinOverride: 220,
    },
    meta('generic-tpu', 'tpu', 'Generic', 'GFU99'),
  ];

function meta(
  id: string,
  filamentTypeId: string,
  filamentBrand: string,
  trayInfoIdx: string,
): FilamentMetaTypeDefinitionDto {
  return { id, filamentTypeId, filamentBrand, trayInfoIdx };
}
