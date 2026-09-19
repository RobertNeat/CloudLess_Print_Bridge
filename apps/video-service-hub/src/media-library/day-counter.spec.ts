import { assignDayCounters, withCounterSuffix } from './day-counter';

type Item = { id: string; cameraId: string; capturedAt: string };

function item(id: string, capturedAt: string, cameraId = 'camera-1'): Item {
  return { id, cameraId, capturedAt };
}

describe('assignDayCounters', () => {
  it('numbers items within the same camera+day starting at 1, oldest first', () => {
    const items = [
      item('c', '2026-01-01T10:00:00.000Z'),
      item('a', '2026-01-01T08:00:00.000Z'),
      item('b', '2026-01-01T09:00:00.000Z'),
    ];
    const counters = assignDayCounters(items);
    expect(counters.get(items[1])).toBe(1); // a, earliest
    expect(counters.get(items[2])).toBe(2); // b
    expect(counters.get(items[0])).toBe(3); // c, latest
  });

  it('keeps counters independent per camera', () => {
    const items = [
      item('a', '2026-01-01T08:00:00.000Z', 'camera-1'),
      item('b', '2026-01-01T08:00:00.000Z', 'camera-2'),
    ];
    const counters = assignDayCounters(items);
    expect(counters.get(items[0])).toBe(1);
    expect(counters.get(items[1])).toBe(1);
  });

  it('keeps counters independent per calendar day', () => {
    const items = [
      item('a', '2026-01-01T23:59:59.000Z'),
      item('b', '2026-01-02T00:00:01.000Z'),
    ];
    const counters = assignDayCounters(items);
    expect(counters.get(items[0])).toBe(1);
    expect(counters.get(items[1])).toBe(1);
  });

  it('does not restart the counter at a page boundary (item 21 stays _021, not _001)', () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      item(
        `item-${index}`,
        `2026-01-01T${String(index).padStart(2, '0')}:00:00.000Z`,
      ),
    );
    const counters = assignDayCounters(items);
    // Simulate pagination: only items 20..24 (the 21st..25th of the day) are
    // on "page 2". Their counters must already reflect their true rank
    // within the full day, computed before any slicing happened.
    const pageTwo = items.slice(20);
    expect(pageTwo.map((entry) => counters.get(entry))).toEqual([
      21, 22, 23, 24, 25,
    ]);
  });
});

describe('withCounterSuffix', () => {
  it('inserts the zero-padded counter before the extension', () => {
    expect(withCounterSuffix('image-front_(192.168.1.205).jpg', 3)).toBe(
      'image-front_(192.168.1.205)_003.jpg',
    );
  });

  it('pads triple-digit counters without truncating', () => {
    expect(withCounterSuffix('audio-front.wav', 123)).toBe(
      'audio-front_123.wav',
    );
  });

  it('appends the suffix directly when the filename has no extension', () => {
    expect(withCounterSuffix('no-extension', 1)).toBe('no-extension_001');
  });
});
