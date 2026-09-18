/**
 * Assigns a `_00x` display suffix to each item's file name, grouped by
 * calendar day (UTC) and camera, ordered oldest-to-newest within the day so
 * the counter reads as "the Nth file produced that day". Must run over the
 * FULL set for a given kind+camera before any cursor-based page slicing,
 * otherwise an item at a page boundary (e.g. the 21st item of the day) would
 * incorrectly restart at _001.
 */
export function assignDayCounters<
  T extends { cameraId: string; capturedAt: string },
>(items: T[]): Map<T, number> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = item.capturedAt.slice(0, 10); // YYYY-MM-DD (UTC date portion of an ISO string)
    const key = `${item.cameraId}|${day}`;
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const counters = new Map<T, number>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt),
    );
    ordered.forEach((item, index) => counters.set(item, index + 1));
  }
  return counters;
}

/** Inserts a zero-padded `_00x` suffix before a filename's extension. */
export function withCounterSuffix(fileName: string, counter: number): string {
  const suffix = `_${String(counter).padStart(3, '0')}`;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return `${fileName}${suffix}`;
  return `${fileName.slice(0, lastDot)}${suffix}${fileName.slice(lastDot)}`;
}
