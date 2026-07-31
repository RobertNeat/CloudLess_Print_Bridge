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
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Number.isNaN(value)
    ) {
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

