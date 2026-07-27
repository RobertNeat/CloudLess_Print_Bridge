export type PrinterJobStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'finished'
  | 'error'
  | 'unknown';

export interface PrinterTemperatureDto {
  current?: number;
  target?: number;
}

export interface PrinterTemperaturesDto {
  nozzle?: PrinterTemperatureDto;
  bed?: PrinterTemperatureDto;
  chamber?: PrinterTemperatureDto;
}

export interface PrinterJobDto {
  status?: PrinterJobStatus;
  progressPercent?: number;
  remainingSeconds?: number;
  currentLayer?: number;
  totalLayers?: number;
  fileName?: string;
}

export interface PrinterFansDto {
  heatbreakPercent?: number;
  coolingPercent?: number;
  auxiliaryPercent?: number;
  chamberPercent?: number;
}

export interface PrinterDomainModelDto {
  temperatures?: PrinterTemperaturesDto;
  job?: PrinterJobDto;
  fans?: PrinterFansDto;
  lightOn?: boolean;
  speedPercent?: number;
  amsSlots?: Record<string, unknown>[];
  externalSpool?: Record<string, unknown>;
}

/**
 * Backward-compatible alias. New consumers should prefer
 * PrinterDomainModelDto to make the API-boundary role explicit.
 */
export type PrinterDomainModel = PrinterDomainModelDto;
