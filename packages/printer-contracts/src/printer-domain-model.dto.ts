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
  /**
   * Identifier of the thumbnail PNG, resolvable via GET
   * /print_job/thumbnail on mqtt-puppeteer. Undefined until resolved (or
   * if it never resolves for this file).
   */
  thumbnailId?: string;
}

export interface PrinterFansDto {
  heatbreakPercent?: number;
  coolingPercent?: number;
  auxiliaryPercent?: number;
  chamberPercent?: number;
}

export interface AmsFilamentDto {
  id?: string;
  displayName?: string;
  type?: string;
  brand?: string;
}

export interface AmsSlotDto {
  id: string;
  unitId: string;
  position: number;
  occupied: boolean;
  active: boolean;
  filament?: AmsFilamentDto;
  color?: string;
  remainingPercent?: number;
  nozzleTemperatureMin?: number;
  nozzleTemperatureMax?: number;
}

export interface AmsUnitDto {
  id: string;
  position: number;
  humidityPercent?: number;
  temperatureCelsius?: number;
  slots: AmsSlotDto[];
}

export interface ExternalSpoolDto {
  id: 'external-spool';
  occupied: boolean;
  active: boolean;
  filament?: AmsFilamentDto;
  color?: string;
  nozzleTemperatureMin?: number;
  nozzleTemperatureMax?: number;
}

export interface AmsSystemDto {
  units: AmsUnitDto[];
  externalSpool?: ExternalSpoolDto;
  activeSourceId?: string;
}

export interface PrinterDomainModelDto {
  temperatures?: PrinterTemperaturesDto;
  job?: PrinterJobDto;
  fans?: PrinterFansDto;
  lightOn?: boolean;
  speedPercent?: number;
  ams?: AmsSystemDto;
  position?: import('./printer-motion.dto.js').PrinterPositionDto;
}

/**
 * Backward-compatible alias. New consumers should prefer
 * PrinterDomainModelDto to make the API-boundary role explicit.
 */
export type PrinterDomainModel = PrinterDomainModelDto;
