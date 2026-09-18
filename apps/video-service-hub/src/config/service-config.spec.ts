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

  it('defaults the encode inactivity window to 45 seconds', () => {
    expect(loadServiceConfig(baseEnv).timelapse.encodeInactivityMs).toBe(
      45_000,
    );
  });

  it('reads a configured inactivity window', () => {
    const config = loadServiceConfig({
      ...baseEnv,
      TIMELAPSE_ENCODE_INACTIVITY_MS: '5000',
    });
    expect(config.timelapse.encodeInactivityMs).toBe(5_000);
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
