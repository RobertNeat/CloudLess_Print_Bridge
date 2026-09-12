/**
 * One point-in-time telemetry sample retained by the bridge's in-memory
 * history buffer. Derived from the printer domain model, not raw MQTT
 * fields, so it stays valid across printer profile swaps.
 */
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

export interface TelemetryHistoryDto {
  capacity: number;
  samples: TelemetrySampleDto[];
}
