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
