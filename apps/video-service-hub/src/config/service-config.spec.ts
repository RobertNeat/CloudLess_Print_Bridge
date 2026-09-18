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
      TIMELAPSE_FPS: '24',
    });
    expect(config.timelapse.fps).toBe(24);
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
