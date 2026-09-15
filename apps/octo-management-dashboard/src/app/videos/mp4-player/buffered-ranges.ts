export type BufferedSegment = {
  readonly leftPercent: number;
  readonly widthPercent: number;
};

/**
 * Maps a native TimeRanges (video.buffered()) plus the clip duration into
 * percentage-based segments for a visual "what's buffered" bar. Pulled out
 * as a pure function (no DOM/player dependency) so the mapping is testable
 * without constructing a real video element.
 */
export function toBufferedSegments(
  buffered: { length: number; start(index: number): number; end(index: number): number },
  duration: number,
): BufferedSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const segments: BufferedSegment[] = [];
  for (let index = 0; index < buffered.length; index += 1) {
    const start = clamp(buffered.start(index), 0, duration);
    const end = clamp(buffered.end(index), 0, duration);
    if (end <= start) continue;
    segments.push({
      leftPercent: (start / duration) * 100,
      widthPercent: ((end - start) / duration) * 100,
    });
  }
  return segments;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
