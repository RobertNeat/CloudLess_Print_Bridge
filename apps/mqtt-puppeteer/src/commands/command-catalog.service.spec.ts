import { BadRequestException } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { FilamentCatalogService } from '../filaments/filament-catalog.service';
import type { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import { BambuLabA1CommandProfile } from '../printer-profiles/bambu-lab-a1/bambu-lab-a1-command.profile';
import { CommandCatalogService } from './command-catalog.service';
import type { OperationTrackerService } from '../operations/operation-tracker.service';

describe('CommandCatalogService', () => {
  const config = {
    commands: { catalogPath: undefined, catalogMode: 'replace' },
    filaments: { catalogPath: undefined, catalogMode: 'replace' },
    filamentSystem: {
      amsUnitCount: 2,
      slotsPerUnit: 4,
      externalSpool: true,
    },
  } as AppConfig;
  const publishMock = jest.fn().mockResolvedValue({
    published: true,
    topic: 'device/test/request',
    qos: 0,
  });
  const mqtt = { publish: publishMock } as unknown as MqttTransportService;
  const filaments = new FilamentCatalogService(config);
  const profile = new BambuLabA1CommandProfile(config, filaments);
  const beginOperationMock = jest.fn();
  const rejectOperationMock = jest.fn();
  const operations = {
    begin: beginOperationMock,
    reject: rejectOperationMock,
  } as unknown as OperationTrackerService;

  const createService = () =>
    new CommandCatalogService(config, mqtt, profile, operations);

  beforeEach(() => jest.clearAllMocks());

  it('builds tested A1 command patterns with supplied parameters', () => {
    const service = createService();

    expect(service.build('set-light', { enabled: true })).toEqual({
      system: {
        sequence_id: '0',
        command: 'ledctrl',
        led_node: 'chamber_light',
        led_mode: 'on',
      },
    });
    expect(service.build('move-absolute', { x: 125, z: 20 })).toHaveProperty(
      'print.param',
      'G90\nG1 X125 Z20 F3000\n',
    );
  });

  it('builds the shared command preview response', () => {
    const service = createService();

    expect(service.preview('move-absolute', { x: 125, z: 20 })).toEqual({
      commandId: 'move-absolute',
      payload: {
        print: {
          sequence_id: '0',
          command: 'gcode_line',
          param: 'G90\nG1 X125 Z20 F3000\n',
        },
      },
    });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe coordinates before publishing', () => {
    const service = createService();

    expect(() => service.build('move-absolute', { z: 10 })).toThrow(
      BadRequestException,
    );
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('rejects a tracked operation when command validation fails', async () => {
    const service = createService();

    await expect(
      service.execute('move-absolute', { z: 10 }, 'operation-invalid'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(beginOperationMock).toHaveBeenCalledWith({
      operationId: 'operation-invalid',
      sequenceId: 'operation-invalid',
      commandId: 'move-absolute',
    });
    expect(rejectOperationMock).toHaveBeenCalledWith(
      'operation-invalid',
      expect.stringContaining('z must be at least 20'),
    );
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes a named command only after rendering it', async () => {
    const service = createService();

    await expect(
      service.execute('set-bed-temperature', { celsius: 50 }, 'operation-1'),
    ).resolves.toMatchObject({
      published: true,
      commandId: 'set-bed-temperature',
    });
    expect(publishMock).toHaveBeenCalledWith(
      {
        print: {
          sequence_id: '0',
          command: 'gcode_line',
          param: 'M140 S50\n',
        },
      },
      {
        operationId: 'operation-1',
        commandId: 'set-bed-temperature',
      },
    );
  });

  it('maps universal print actions and speed modes to A1 payloads', () => {
    const service = createService();

    expect(service.build('pause-print', {})).toEqual({
      print: { sequence_id: '0', command: 'pause', param: '' },
    });
    expect(service.build('set-print-speed', { mode: 'sport' })).toEqual({
      print: { sequence_id: '0', command: 'print_speed', param: '3' },
    });
    expect(() =>
      service.build('set-print-speed', { mode: 'unsupported' }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['pause-print', 'pause'],
    ['resume-print', 'resume'],
    ['cancel-print', 'stop'],
  ])('maps %s to the A1 %s action', (commandId, mqttCommand) => {
    const service = createService();

    expect(service.build(commandId, {})).toEqual({
      print: { sequence_id: '0', command: mqttCommand, param: '' },
    });
  });

  it('maps an AMS unit and local slot to the printer target', () => {
    const service = createService();

    expect(
      service.build('load-filament', {
        sourceKind: 'ams',
        amsUnitId: 1,
        slotId: 2,
        filamentId: 'generic-pla',
      }),
    ).toEqual({
      print: {
        sequence_id: '1002',
        command: 'ams_change_filament',
        ams_id: 1,
        slot_id: 2,
        target: 6,
        curr_temp: -1,
        tar_temp: 240,
      },
    });
  });

  it('maps a filament meta-type to external spool settings', () => {
    const service = createService();

    expect(
      service.build('set-filament', {
        sourceKind: 'external',
        filamentId: 'generic-petg',
        trayColor: '00FFFFFF',
      }),
    ).toEqual({
      print: {
        sequence_id: '1201',
        command: 'ams_filament_setting',
        ams_id: 255,
        tray_id: 254,
        tray_info_idx: 'GFG99',
        tray_color: '00FFFFFF',
        nozzle_temp_min: 220,
        nozzle_temp_max: 270,
        tray_type: 'PETG',
      },
    });
  });

  it('maps loading and unloading an external spool', () => {
    const service = createService();

    expect(
      service.build('load-filament', {
        sourceKind: 'external',
        filamentId: 'generic-pla',
      }),
    ).toEqual({
      print: {
        sequence_id: '1002',
        command: 'ams_change_filament',
        target: 254,
        slot_id: 254,
        curr_temp: -1,
        tar_temp: 240,
      },
    });
    expect(service.build('unload-filament', {})).toEqual({
      print: {
        sequence_id: '1003',
        command: 'unload_filament',
      },
    });
  });

  it('maps an AMS filament definition with local unit and slot ids', () => {
    const service = createService();

    expect(
      service.build('set-filament', {
        sourceKind: 'ams',
        amsUnitId: 1,
        slotId: 3,
        filamentId: 'bambu-lab-pla-cf',
      }),
    ).toEqual({
      print: {
        sequence_id: '1102',
        command: 'ams_filament_setting',
        ams_id: 1,
        tray_id: 3,
        tray_info_idx: 'GFA50',
        tray_color: 'FFFFFFFF',
        nozzle_temp_min: 210,
        nozzle_temp_max: 250,
        tray_type: 'PLA-CF',
      },
    });
  });

  it('rejects invalid filament locations and temperature ranges', () => {
    const service = createService();

    expect(() =>
      service.build('load-filament', {
        sourceKind: 'ams',
        amsUnitId: 2,
        slotId: 0,
        targetTemperature: 220,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.build('set-filament', {
        sourceKind: 'external',
        filamentId: 'generic-pla',
        nozzleTemperatureMin: 250,
        nozzleTemperatureMax: 200,
      }),
    ).toThrow(BadRequestException);
  });
});
