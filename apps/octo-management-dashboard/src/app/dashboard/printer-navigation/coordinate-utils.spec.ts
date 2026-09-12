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
    expect(() => validateCoordinates({ X: 0, Y: Number.POSITIVE_INFINITY, Z: 0 })).toThrowError(
      TypeError,
    );
    expect(() => validateCoordinates({ X: 0, Y: 0, Z: '1' as unknown as number })).toThrowError(
      TypeError,
    );
  });

  describe('against the real Bambu Lab A1 machine envelope (X:0-256, Y:0-256, Z:20-240)', () => {
    const realEnvelope: AxisRanges = {
      X: { min: 0, max: 256 },
      Y: { min: 0, max: 256 },
      Z: { min: 20, max: 240 },
    };

    it('clamps a Z target of 0 up to the real minimum of 20, not down to 0', () => {
      // DEFAULT_AXIS_RANGES (mock-only) would accept Z:0 — the real printer
      // would reject it and the docs call sub-20 Z moves unsafe (risk of
      // scratching the plate). This is the exact case that motivated
      // sourcing axisRanges from the backend instead of the frontend default.
      expect(clampCoordinates({ X: 100, Y: 100, Z: 0 }, realEnvelope)).toEqual({
        X: 100,
        Y: 100,
        Z: 20,
      });
    });

    it('clamps an excessive Z target down to the real maximum of 240', () => {
      expect(clampCoordinates({ X: 100, Y: 100, Z: 500 }, realEnvelope)).toEqual({
        X: 100,
        Y: 100,
        Z: 240,
      });
    });

    it('accepts X/Y at the real maximum of 256 (boundary inclusive)', () => {
      expect(clampCoordinates({ X: 256, Y: 256, Z: 20 }, realEnvelope)).toEqual({
        X: 256,
        Y: 256,
        Z: 20,
      });
    });

    it('clamps X/Y just above the real maximum of 256 down to 256', () => {
      expect(clampCoordinates({ X: 256.1, Y: 256.1, Z: 20 }, realEnvelope)).toEqual({
        X: 256,
        Y: 256,
        Z: 20,
      });
    });
  });
});
