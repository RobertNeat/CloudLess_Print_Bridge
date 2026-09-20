import { loadServiceConfig, resolveEnvReferences } from './service-config';

describe('environment variable interpolation', () => {
  it('resolves a printer host reference', () => {
    expect(
      resolveEnvReferences('${BAMBULAB_A1_IP}', {
        BAMBULAB_A1_IP: '192.168.1.100',
      }),
    ).toBe('192.168.1.100');
  });

  it('resolves Bambu Lab FTPS port and username settings', () => {
    expect(
      resolveEnvReferences(
        '${BAMBULAB_A1_FTPS_PORT}:${BAMBULAB_A1_FTPS_USERNAME}',
        {
          BAMBULAB_A1_FTPS_PORT: '990',
          BAMBULAB_A1_FTPS_USERNAME: 'bblp',
        },
      ),
    ).toBe('990:bblp');
  });

  it('resolves chained references', () => {
    expect(resolveEnvReferences('${A}/${B}', { A: '${B}', B: 'value' })).toBe(
      'value/value',
    );
  });

  it('rejects circular references', () => {
    expect(() =>
      resolveEnvReferences('${A}', { A: '${B}', B: '${A}' }),
    ).toThrow('Circular environment variable reference');
  });
});

describe('service configuration', () => {
  const validEnvironment = {
    FTPS_REMOTE_MANAGER_FTP_HOST: '192.168.1.100',
    FTPS_REMOTE_MANAGER_FTP_USER: 'bblp',
    FTPS_REMOTE_MANAGER_FTP_PASSWORD: 'secret',
    FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256: 'AA:'.repeat(31) + 'AA',
  };

  it('loads A1-compatible defaults and normalizes the fingerprint', () => {
    const config = loadServiceConfig(validEnvironment);

    expect(config.ftps).toMatchObject({
      host: '192.168.1.100',
      port: 990,
      username: 'bblp',
      tlsMode: 'implicit',
      timeoutMs: 10_000,
      maximumConcurrentSessions: 1,
      certificateFingerprint256: 'AA'.repeat(32),
    });
    expect(config.http.host).toBe('127.0.0.1');
    expect(config.http.corsOrigins).toEqual(['http://localhost:10300']);
    expect(config.upload.maximumBytes).toBe(250 * 1024 * 1024);
  });

  it('parses a comma-separated CORS origins list', () => {
    const config = loadServiceConfig({
      ...validEnvironment,
      FTPS_REMOTE_MANAGER_CORS_ORIGINS:
        'http://localhost:4200, http://localhost:4201',
    });

    expect(config.http.corsOrigins).toEqual([
      'http://localhost:4200',
      'http://localhost:4201',
    ]);
  });

  it('allows all CORS origins with a wildcard', () => {
    const config = loadServiceConfig({
      ...validEnvironment,
      FTPS_REMOTE_MANAGER_CORS_ORIGINS: '*',
    });

    expect(config.http.corsOrigins).toBe(true);
  });

  it('rejects an invalid certificate fingerprint', () => {
    expect(() =>
      loadServiceConfig({
        ...validEnvironment,
        FTPS_REMOTE_MANAGER_FTP_TLS_FINGERPRINT256: 'untrusted',
      }),
    ).toThrow('64 hexadecimal');
  });

  it('rejects a port outside the TCP range', () => {
    expect(() =>
      loadServiceConfig({
        ...validEnvironment,
        FTPS_REMOTE_MANAGER_FTP_PORT: '70000',
      }),
    ).toThrow('FTPS_REMOTE_MANAGER_FTP_PORT');
  });
});
