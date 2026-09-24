import { loadServiceConfig, resolveEnvReferences } from './service-config';

describe('CORS origin configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults to the dashboard local dev origin', () => {
    expect(loadServiceConfig(baseEnv).http.corsOrigins).toEqual([
      'http://localhost:10300',
    ]);
  });

  it('parses a comma-separated origin list', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_CORS_ORIGINS:
        'http://localhost:10300, https://dashboard.example.com',
    });

    expect(config.http.corsOrigins).toEqual([
      'http://localhost:10300',
      'https://dashboard.example.com',
    ]);
  });

  it('treats a literal "*" as reflect-any-origin', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_CORS_ORIGINS: '*',
    });

    expect(config.http.corsOrigins).toBe(true);
  });
});

describe('timelapse configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults the encode fps to 12', () => {
    expect(loadServiceConfig(baseEnv).timelapse.fps).toBe(12);
  });

  it('reads a configured fps', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_TIMELAPSE_FPS: '24',
    });
    expect(config.timelapse.fps).toBe(24);
  });

  it('defaults the max duration to 1 hour', () => {
    expect(loadServiceConfig(baseEnv).timelapse.maxDurationMs).toBe(3_600_000);
  });

  it('reads a configured max duration in seconds and converts to ms', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_TIMELAPSE_MAX_LENGTH_SEC: '7200',
    });
    expect(config.timelapse.maxDurationMs).toBe(7_200_000);
  });

  it('rejects a non-integer max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_TIMELAPSE_MAX_LENGTH_SEC: 'abc',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_TIMELAPSE_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });

  it('rejects a zero max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_TIMELAPSE_MAX_LENGTH_SEC: '0',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_TIMELAPSE_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });

  it('defaults the interval max duration to 1 hour', () => {
    expect(loadServiceConfig(baseEnv).timelapse.intervalMaxDurationMs).toBe(
      3_600_000,
    );
  });

  it('reads a configured interval max duration in seconds and converts to ms', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_TIMELAPSE_INTERVAL_MAX_LENGTH_SEC: '7200',
    });
    expect(config.timelapse.intervalMaxDurationMs).toBe(7_200_000);
  });

  it('rejects a non-integer interval max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_TIMELAPSE_INTERVAL_MAX_LENGTH_SEC: 'abc',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_TIMELAPSE_INTERVAL_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });

  it('rejects a zero interval max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_TIMELAPSE_INTERVAL_MAX_LENGTH_SEC: '0',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_TIMELAPSE_INTERVAL_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });
});

describe('recording configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults the max duration to 1 hour', () => {
    expect(loadServiceConfig(baseEnv).recording.maxDurationMs).toBe(3_600_000);
  });

  it('reads a configured max duration in seconds and converts to ms', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_VIDEO_MAX_LENGTH_SEC: '7200',
    });
    expect(config.recording.maxDurationMs).toBe(7_200_000);
  });

  it('rejects a non-integer max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_VIDEO_MAX_LENGTH_SEC: 'abc',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_VIDEO_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });

  it('rejects a zero max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_VIDEO_MAX_LENGTH_SEC: '0',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_VIDEO_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });
});

describe('live configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults the max duration to 24 hours', () => {
    expect(loadServiceConfig(baseEnv).live.maxDurationMs).toBe(86_400_000);
  });

  it('reads a configured max duration in seconds and converts to ms', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_LIVESTREAM_MAX_LENGTH_SEC: '7200',
    });
    expect(config.live.maxDurationMs).toBe(7_200_000);
  });

  it('rejects a non-integer max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_LIVESTREAM_MAX_LENGTH_SEC: 'abc',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_LIVESTREAM_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });

  it('rejects a zero max duration', () => {
    expect(() =>
      loadServiceConfig({
        ...baseEnv,
        VIDEO_SERVICE_HUB_LIVESTREAM_MAX_LENGTH_SEC: '0',
      }),
    ).toThrow(
      'VIDEO_SERVICE_HUB_LIVESTREAM_MAX_LENGTH_SEC must be an integer between 1 and 4294967',
    );
  });
});

describe('mqtt host configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults the bind host to 0.0.0.0', () => {
    expect(loadServiceConfig(baseEnv).mqtt.host).toBe('0.0.0.0');
  });

  it('reads a configured bind host', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_MQTT_HOST: '127.0.0.1',
    });
    expect(config.mqtt.host).toBe('127.0.0.1');
  });
});

describe('storage part-size configuration', () => {
  const baseEnv = { VIDEO_SERVICE_HUB_MQTT_PORT: '0' } as NodeJS.ProcessEnv;

  it('defaults every per-kind byte limit to 8MB', () => {
    const config = loadServiceConfig(baseEnv);
    expect(config.storage.captureMaxBytes).toBe(8 * 1024 * 1024);
    expect(config.storage.timelapsePartMaxBytes).toBe(8 * 1024 * 1024);
    expect(config.storage.recordingPartMaxBytes).toBe(8 * 1024 * 1024);
    expect(config.storage.audioPartMaxBytes).toBe(8 * 1024 * 1024);
  });

  it('reads each kind-specific override independently', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      VIDEO_SERVICE_HUB_CAPTURE_MAX_BYTES: String(1024),
      VIDEO_SERVICE_HUB_TIMELAPSE_PART_MAX_BYTES: String(2048),
      VIDEO_SERVICE_HUB_RECORDING_PART_MAX_BYTES: String(4096),
      VIDEO_SERVICE_HUB_AUDIO_PART_MAX_BYTES: String(8192),
    });
    expect(config.storage.captureMaxBytes).toBe(1024);
    expect(config.storage.timelapsePartMaxBytes).toBe(2048);
    expect(config.storage.recordingPartMaxBytes).toBe(4096);
    expect(config.storage.audioPartMaxBytes).toBe(8192);
  });
});

describe('environment variable interpolation', () => {
  it('resolves a direct reference', () => {
    expect(
      resolveEnvReferences('${BAMBULAB_A1_IP}', {
        BAMBULAB_A1_IP: '192.168.1.100',
      }),
    ).toBe('192.168.1.100');
  });

  it('resolves chained references', () => {
    expect(resolveEnvReferences('${A}:${B}', { A: '${B}', B: 'value' })).toBe(
      'value:value',
    );
  });

  it('rejects circular references', () => {
    expect(() =>
      resolveEnvReferences('${A}', { A: '${B}', B: '${A}' }),
    ).toThrow('Circular environment variable reference');
  });
});
