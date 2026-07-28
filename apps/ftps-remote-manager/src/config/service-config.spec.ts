import { loadServiceConfig } from './service-config';

describe('service configuration', () => {
  const validEnvironment = {
    FTP_HOST: '192.168.1.100',
    FTP_USER: 'bblp',
    FTP_PASSWORD: 'secret',
    FTP_TLS_FINGERPRINT256: 'AA:'.repeat(31) + 'AA',
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
    expect(config.upload.maximumBytes).toBe(250 * 1024 * 1024);
  });

  it('rejects an invalid certificate fingerprint', () => {
    expect(() =>
      loadServiceConfig({
        ...validEnvironment,
        FTP_TLS_FINGERPRINT256: 'untrusted',
      }),
    ).toThrow('64 hexadecimal');
  });

  it('rejects a port outside the TCP range', () => {
    expect(() =>
      loadServiceConfig({ ...validEnvironment, FTP_PORT: '70000' }),
    ).toThrow('FTP_PORT');
  });
});
