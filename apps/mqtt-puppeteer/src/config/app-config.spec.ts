import { loadAppConfig, resolveEnvReferences } from './app-config';

describe('environment variable interpolation', () => {
  it('resolves a direct reference', () => {
    expect(
      resolveEnvReferences('${BAMBULAB_A1_IP}', {
        BAMBULAB_A1_IP: '192.168.1.100',
      }),
    ).toBe('192.168.1.100');
  });

  it('resolves Bambu Lab MQTT port and username settings', () => {
    expect(
      resolveEnvReferences(
        '${BAMBULAB_A1_MQTT_PORT}:${BAMBULAB_A1_MQTT_USERNAME}',
        {
          BAMBULAB_A1_MQTT_PORT: '8883',
          BAMBULAB_A1_MQTT_USERNAME: 'bblp',
        },
      ),
    ).toBe('8883:bblp');
  });

  it('resolves chained references and preserves unknown placeholders', () => {
    expect(
      resolveEnvReferences('${A}:${B}:${UNKNOWN}', {
        A: '${B}',
        B: 'value',
      }),
    ).toBe('value:value:${UNKNOWN}');
  });

  it('rejects circular references', () => {
    expect(() =>
      resolveEnvReferences('${A}', { A: '${B}', B: '${A}' }),
    ).toThrow('Circular environment variable reference');
  });
});

describe('CORS origin configuration', () => {
  const baseEnv = { MQTT_PUPPETEER_PRINTER_SN: undefined } as NodeJS.ProcessEnv;

  it('defaults to the dashboard local dev origin', () => {
    expect(loadAppConfig(baseEnv).http.corsOrigins).toEqual([
      'http://localhost:4200',
    ]);
  });

  it('parses a comma-separated origin list', () => {
    const config = loadAppConfig({
      ...baseEnv,
      MQTT_PUPPETEER_CORS_ORIGINS:
        'http://localhost:4200, https://dashboard.example.com',
    });

    expect(config.http.corsOrigins).toEqual([
      'http://localhost:4200',
      'https://dashboard.example.com',
    ]);
  });

  it('treats a literal "*" as reflect-any-origin', () => {
    const config = loadAppConfig({
      ...baseEnv,
      MQTT_PUPPETEER_CORS_ORIGINS: '*',
    });

    expect(config.http.corsOrigins).toBe(true);
  });
});

describe('telemetry history configuration', () => {
  it('defaults the history capacity to 720 samples', () => {
    expect(loadAppConfig({}).telemetry.historyCapacity).toBe(720);
  });

  it('reads a configured capacity', () => {
    const config = loadAppConfig({
      MQTT_PUPPETEER_TELEMETRY_HISTORY_CAPACITY: '100',
    });

    expect(config.telemetry.historyCapacity).toBe(100);
  });
});
