export interface AxisRangeDto {
  minimum: number;
  maximum: number;
}

export interface MachineEnvelopeDto {
  x: AxisRangeDto;
  y: AxisRangeDto;
  z: AxisRangeDto;
}

export interface HeaterCapabilitiesDto {
  hasChamberHeater: boolean;
}

export interface DeviceProfileResponseDto {
  id: string;
  topology: { unitCount: number; slotsPerUnit: number; externalSpool: boolean };
  machineEnvelope: MachineEnvelopeDto;
  heaterCapabilities?: HeaterCapabilitiesDto;
}

export type PrinterPositionSource = 'unknown' | 'homed' | 'commanded';

export interface PrinterPositionDto {
  x: number | null;
  y: number | null;
  z: number | null;
  homed: boolean;
  source: PrinterPositionSource;
  updatedAt: string | null;
}

export interface PrinterTemperatureDto {
  current?: number;
  target?: number;
}

export interface PrinterTemperaturesDto {
  nozzle?: PrinterTemperatureDto;
  bed?: PrinterTemperatureDto;
  chamber?: PrinterTemperatureDto;
}

export type PrinterJobStatusDto = 'idle' | 'running' | 'paused' | 'finished' | 'error' | 'unknown';

export interface PrinterJobDto {
  status?: PrinterJobStatusDto;
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
  position?: PrinterPositionDto;
}

export interface TelemetrySampleDto {
  capturedAt: string;
  progressPercent: number | null;
  nozzleTemperatureCurrent: number | null;
  nozzleTemperatureTarget: number | null;
  bedTemperatureCurrent: number | null;
  bedTemperatureTarget: number | null;
  chamberTemperatureCurrent: number | null;
  coolingFanPercent: number | null;
  auxiliaryFanPercent: number | null;
}

export interface TelemetryHistoryResponseDto {
  capacity: number;
  samples: TelemetrySampleDto[];
}

export interface BackendErrorBody {
  statusCode: number;
  message: string;
  operationId?: string;
}
