export type PrinterCommandId =
  | 'fetch-status'
  | 'pause-print'
  | 'resume-print'
  | 'cancel-print'
  | 'set-print-speed'
  | 'load-filament'
  | 'unload-filament'
  | 'set-filament'
  | 'set-bed-temperature'
  | 'set-nozzle-temperature'
  | 'set-part-fan'
  | 'set-light'
  | 'home'
  | 'move-absolute'
  | 'extrude-relative';

export type PrintSpeedMode = 'silent' | 'standard' | 'sport' | 'ludicrous';
export type FilamentSourceKind = 'ams' | 'external';

export interface FilamentSourceParametersDto {
  sourceKind: FilamentSourceKind;
  amsUnitId?: number;
  slotId?: number;
}

export interface LoadFilamentParametersDto
  extends FilamentSourceParametersDto {
  filamentId?: string;
  targetTemperature?: number;
}

export interface SetFilamentParametersDto
  extends FilamentSourceParametersDto {
  filamentId: string;
  trayColor?: string;
  nozzleTemperatureMin?: number;
  nozzleTemperatureMax?: number;
}

export interface SetPrintSpeedParametersDto {
  mode: PrintSpeedMode;
}

export interface PrinterCommandRequestDto<
  TParameters extends object = Record<string, never>,
> {
  id: PrinterCommandId | (string & {});
  parameters: TParameters;
}

export interface AmsTopologyDto {
  unitCount: number;
  slotsPerUnit: number;
  externalSpool: boolean;
}
