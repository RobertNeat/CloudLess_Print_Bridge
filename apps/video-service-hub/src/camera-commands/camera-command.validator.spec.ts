import { validateCommandPayload } from './camera-command.validator';

const baseOptions = {
  timelapseMaxDurationMs: 3_600_000,
  recordingMaxDurationMs: 3_600_000,
  liveMaxDurationMs: 86_400_000,
  intervalMaxDurationMs: 3_600_000,
};

describe('validateCommandPayload — periodic-capture duration limits', () => {
  it('accepts a durationMs at the configured timelapse limit', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 1_000,
          durationMs: 7_200_000,
        },
        { ...baseOptions, timelapseMaxDurationMs: 7_200_000 },
      ),
    ).not.toThrow();
  });

  it('rejects a durationMs above the configured timelapse limit', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 1_000,
          durationMs: 3_600_001,
        },
        baseOptions,
      ),
    ).toThrow(/durationMs must be/);
  });

  it('accepts a durationMs above the fixed 1h constant when the configured limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 1_000,
          durationMs: 5_000_000,
        },
        { ...baseOptions, timelapseMaxDurationMs: 7_200_000 },
      ),
    ).not.toThrow();
  });

  it('caps intervalMs to the lower of the configured interval limit and the configured timelapse limit', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 1_800_001,
          durationMs: 1_800_000,
        },
        { ...baseOptions, timelapseMaxDurationMs: 1_800_000 },
      ),
    ).toThrow(/intervalMs must be/);
  });

  it('does not let intervalMs exceed the configured interval limit even when the timelapse limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 3_600_001,
          durationMs: 7_200_000,
        },
        { ...baseOptions, timelapseMaxDurationMs: 7_200_000 },
      ),
    ).toThrow(/intervalMs must be/);
  });

  it('does not let intervalMs exceed the configured interval limit even when the recording limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 3_600_001,
          durationMs: 3_600_000,
        },
        { ...baseOptions, recordingMaxDurationMs: 86_400_000 },
      ),
    ).toThrow(/intervalMs must be/);
  });

  it('accepts intervalMs above the old fixed 1h constant when both the interval and timelapse limits are raised', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 5_000_000,
          durationMs: 7_200_000,
        },
        {
          ...baseOptions,
          intervalMaxDurationMs: 7_200_000,
          timelapseMaxDurationMs: 7_200_000,
        },
      ),
    ).not.toThrow();
  });

  it('rejects intervalMs above the configured interval limit even when the timelapse limit is higher', () => {
    expect(() =>
      validateCommandPayload(
        'periodic-capture',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          intervalMs: 1_800_001,
          durationMs: 7_200_000,
        },
        {
          ...baseOptions,
          intervalMaxDurationMs: 1_800_000,
          timelapseMaxDurationMs: 7_200_000,
        },
      ),
    ).toThrow(/intervalMs must be/);
  });
});

describe('validateCommandPayload — timed-recording and start-recording respect the configured recording limit', () => {
  it('rejects timed-recording durationMs above the fixed 1h default', () => {
    expect(() =>
      validateCommandPayload(
        'timed-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          durationMs: 3_600_001,
        },
        baseOptions,
      ),
    ).toThrow(/durationMs must be/);
  });

  it('accepts timed-recording durationMs at exactly 1h', () => {
    expect(() =>
      validateCommandPayload(
        'timed-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          durationMs: 3_600_000,
        },
        baseOptions,
      ),
    ).not.toThrow();
  });

  it('accepts timed-recording durationMs above the old fixed 1h constant when the configured limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'timed-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          durationMs: 7_200_000,
        },
        { ...baseOptions, recordingMaxDurationMs: 86_400_000 },
      ),
    ).not.toThrow();
  });

  it('rejects timed-recording durationMs above the configured recording limit', () => {
    expect(() =>
      validateCommandPayload(
        'timed-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          durationMs: 86_400_001,
        },
        { ...baseOptions, recordingMaxDurationMs: 86_400_000 },
      ),
    ).toThrow(/durationMs must be/);
  });

  it('rejects start-recording maxDurationMs above the fixed 1h default', () => {
    expect(() =>
      validateCommandPayload(
        'start-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 3_600_001,
        },
        baseOptions,
      ),
    ).toThrow(/maxDurationMs must be/);
  });

  it('accepts start-recording maxDurationMs above the old fixed 1h constant when the configured limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'start-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 7_200_000,
        },
        { ...baseOptions, recordingMaxDurationMs: 86_400_000 },
      ),
    ).not.toThrow();
  });

  it('rejects start-recording maxDurationMs above the configured recording limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-recording',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 86_400_001,
        },
        { ...baseOptions, recordingMaxDurationMs: 86_400_000 },
      ),
    ).toThrow(/maxDurationMs must be/);
  });
});

describe('validateCommandPayload — start-live and start-dynamic-live respect the configured live limit', () => {
  it('accepts start-live maxDurationMs at the default 24h limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-live',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 86_400_000,
        },
        baseOptions,
      ),
    ).not.toThrow();
  });

  it('rejects start-live maxDurationMs above the default 24h limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-live',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 86_400_001,
        },
        baseOptions,
      ),
    ).toThrow(/maxDurationMs must be/);
  });

  it('rejects start-live maxDurationMs above a lowered configured live limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-live',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 3_600_001,
        },
        { ...baseOptions, liveMaxDurationMs: 3_600_000 },
      ),
    ).toThrow(/maxDurationMs must be/);
  });

  it('accepts start-live maxDurationMs above the old fixed 24h constant when the configured limit is raised', () => {
    expect(() =>
      validateCommandPayload(
        'start-live',
        {
          requestId: 'req-1',
          resolution: 'VGA',
          maxDurationMs: 172_800_000,
        },
        { ...baseOptions, liveMaxDurationMs: 172_800_000 },
      ),
    ).not.toThrow();
  });

  it('rejects start-dynamic-live maxDurationMs above the configured live limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-dynamic-live',
        {
          requestId: 'req-1',
          maxDurationMs: 3_600_001,
        },
        { ...baseOptions, liveMaxDurationMs: 3_600_000 },
      ),
    ).toThrow(/maxDurationMs must be/);
  });

  it('accepts start-dynamic-live maxDurationMs within the configured live limit', () => {
    expect(() =>
      validateCommandPayload(
        'start-dynamic-live',
        {
          requestId: 'req-1',
          maxDurationMs: 3_600_000,
        },
        { ...baseOptions, liveMaxDurationMs: 3_600_000 },
      ),
    ).not.toThrow();
  });
});
