import { toBufferedSegments } from './buffered-ranges';

function timeRanges(pairs: readonly (readonly [number, number])[]) {
  return {
    length: pairs.length,
    start: (index: number) => pairs[index][0],
    end: (index: number) => pairs[index][1],
  };
}

describe('toBufferedSegments', () => {
  it('returns no segments for a zero or unknown duration', () => {
    expect(toBufferedSegments(timeRanges([[0, 5]]), 0)).toEqual([]);
    expect(toBufferedSegments(timeRanges([[0, 5]]), NaN)).toEqual([]);
    expect(toBufferedSegments(timeRanges([[0, 5]]), -1)).toEqual([]);
  });

  it('maps a single buffered range to a percentage segment', () => {
    const segments = toBufferedSegments(timeRanges([[0, 25]]), 100);
    expect(segments).toEqual([{ leftPercent: 0, widthPercent: 25 }]);
  });

  it('maps multiple disjoint ranges (a seek ahead leaving a gap) independently', () => {
    const segments = toBufferedSegments(
      timeRanges([
        [0, 10],
        [40, 60],
      ]),
      100,
    );
    expect(segments).toEqual([
      { leftPercent: 0, widthPercent: 10 },
      { leftPercent: 40, widthPercent: 20 },
    ]);
  });

  it('clamps a range that extends past duration', () => {
    const segments = toBufferedSegments(timeRanges([[90, 110]]), 100);
    expect(segments).toEqual([{ leftPercent: 90, widthPercent: 10 }]);
  });

  it('skips a degenerate (zero-width) range', () => {
    expect(toBufferedSegments(timeRanges([[5, 5]]), 100)).toEqual([]);
  });
});
