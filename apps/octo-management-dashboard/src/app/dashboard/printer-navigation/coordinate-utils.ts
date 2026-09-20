import { AxisRanges, Coordinates, PrinterAxis } from './printer-navigation.models';
import { PRINTER_AXES } from './printer-navigation.defaults';

export function validateAxisRanges(ranges: AxisRanges): void {
  for (const axis of PRINTER_AXES) {
    const range = ranges[axis];
    if (
      !range ||
      typeof range.min !== 'number' ||
      typeof range.max !== 'number' ||
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      Number.isNaN(range.min) ||
      Number.isNaN(range.max)
    ) {
      throw new TypeError(`Zakres osi ${axis} musi zawierać skończone wartości liczbowe.`);
    }
    if (range.min > range.max) {
      throw new RangeError(`Minimalna wartość osi ${axis} nie może być większa od maksymalnej.`);
    }
  }
}

export function validateCoordinates(values: Coordinates): void {
  for (const axis of PRINTER_AXES) {
    const value = values[axis];
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
      throw new TypeError(`Współrzędna osi ${axis} musi być skończoną liczbą.`);
    }
  }
}

export function clampAxisValue(value: number, range: { min: number; max: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
    throw new TypeError('Ograniczana wartość musi być skończoną liczbą.');
  }
  return Math.min(range.max, Math.max(range.min, value));
}

export function clampCoordinates(values: Coordinates, ranges: AxisRanges): Coordinates {
  validateAxisRanges(ranges);
  validateCoordinates(values);
  return {
    X: clampAxisValue(values.X, ranges.X),
    Y: clampAxisValue(values.Y, ranges.Y),
    Z: clampAxisValue(values.Z, ranges.Z),
  };
}

/**
 * Same as clampCoordinates, but only enforces each axis' upper bound. Used
 * to sanitize a position the backend reported (never to bound a jog target)
 * — the backend's dead-reckoned position can legitimately sit below an
 * axis' configured minimum right after homing (the Bambu Lab A1's real
 * post-G28 Z is below the machine envelope's Z minimum, which exists to
 * bound commanded moves, not the physical home position). Once a
 * move-absolute is commanded, the backend's own clamp guarantees the
 * reported position never again drops below that minimum, so this only
 * ever relaxes the floor for the fixed homed value, not for jogging (jog
 * targets still go through clampCoordinates/clampAxisValue via
 * adjustCoordinates).
 */
export function clampCoordinatesUpperBound(values: Coordinates, ranges: AxisRanges): Coordinates {
  validateAxisRanges(ranges);
  validateCoordinates(values);
  return {
    X: Math.min(ranges.X.max, values.X),
    Y: Math.min(ranges.Y.max, values.Y),
    Z: Math.min(ranges.Z.max, values.Z),
  };
}

export function adjustCoordinates(
  values: Coordinates,
  axis: PrinterAxis,
  delta: number,
  ranges: AxisRanges,
): Coordinates {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || Number.isNaN(delta)) {
    throw new TypeError('Krok osi musi być skończoną liczbą.');
  }
  return {
    ...values,
    [axis]: clampAxisValue(values[axis] + delta, ranges[axis]),
  };
}
