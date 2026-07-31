import {
  adjustCoordinates,
  clampCoordinates,
  validateAxisRanges,
  validateCoordinates,
} from './coordinate-utils';
import { DEFAULT_AXIS_RANGES } from './printer-navigation.defaults';
import { AxisRanges } from './printer-navigation.models';

describe('coordinate utilities', () => {
  it('clamps values independently from range validation', () => {
    expect(clampCoordinates({ X: 300, Y: -1, Z: 12 }, DEFAULT_AXIS_RANGES)).toEqual({
      X: 255,
      Y: 0,
      Z: 12,
    });
    expect(adjustCoordinates({ X: 250, Y: 0, Z: 0 }, 'X', 10, DEFAULT_AXIS_RANGES)).toEqual({
      X: 255,
      Y: 0,
      Z: 0,
    });
  });

  it('supports a different range for every axis', () => {
    const ranges: AxisRanges = {
      X: { min: 0, max: 100 },
      Y: { min: 10, max: 50 },
      Z: { min: -20, max: 20 },
    };
    expect(clampCoordinates({ X: 110, Y: 0, Z: 30 }, ranges)).toEqual({
      X: 100,
      Y: 10,
      Z: 20,
    });
  });

  it('rejects reversed, non-numeric, NaN and infinite ranges', () => {
    const invalidRanges: AxisRanges[] = [
      { ...DEFAULT_AXIS_RANGES, X: { min: 10, max: 0 } },
      { ...DEFAULT_AXIS_RANGES, X: { min: Number.NaN, max: 10 } },
      { ...DEFAULT_AXIS_RANGES, Y: { min: 0, max: Number.POSITIVE_INFINITY } },
      { ...DEFAULT_AXIS_RANGES, Z: { min: '0' as unknown as number, max: 10 } },
    ];
    for (const ranges of invalidRanges) {
      expect(() => validateAxisRanges(ranges)).toThrow();
    }
  });

  it('rejects non-finite coordinate deltas', () => {
    expect(() =>
      adjustCoordinates({ X: 0, Y: 0, Z: 0 }, 'X', Number.NaN, DEFAULT_AXIS_RANGES),
    ).toThrowError(TypeError);
  });

  it('rejects non-numeric, NaN and infinite coordinates', () => {
    expect(() => validateCoordinates({ X: Number.NaN, Y: 0, Z: 0 })).toThrowError(TypeError);
    expect(() =>
      validateCoordinates({ X: 0, Y: Number.POSITIVE_INFINITY, Z: 0 }),
    ).toThrowError(TypeError);
    expect(() =>
      validateCoordinates({ X: 0, Y: 0, Z: '1' as unknown as number }),
    ).toThrowError(TypeError);
  });
});

