export interface AxisRangeDto {
  minimum: number;
  maximum: number;
}

/**
 * Machine-specific travel envelope. Every numeric bound a generic
 * (model-agnostic) layer needs in order to reason about safe motion must be
 * sourced from here rather than hard-coded, so swapping printer profiles
 * changes the enforced limits without touching shared code.
 */
export interface MachineEnvelopeDto {
  x: AxisRangeDto;
  y: AxisRangeDto;
  z: AxisRangeDto;
}

/**
 * Per-model heater capabilities that generic (model-agnostic) code must read
 * instead of assuming — mirrors how MachineEnvelopeDto keeps travel limits
 * out of shared code. Today only the chamber heater varies across profiles
 * (the Bambu Lab A1 has none; bed/nozzle heaters are assumed universal), but
 * this is a dedicated shape so a future flag has an obvious home.
 */
export interface HeaterCapabilitiesDto {
  hasChamberHeater: boolean;
}

export type PrinterPositionSource = 'unknown' | 'homed' | 'commanded';

/**
 * Best-effort, dead-reckoned tool-head position. The Bambu Lab A1 status
 * report does not include live XYZ telemetry, so this is derived purely from
 * commands the bridge has issued (home / move-absolute) and is invalidated
 * whenever that reckoning can no longer be trusted (reconnect, print start).
 * It must never be presented as a live sensor reading.
 */
export interface PrinterPositionDto {
  x: number | null;
  y: number | null;
  z: number | null;
  homed: boolean;
  source: PrinterPositionSource;
  updatedAt: string | null;
}
