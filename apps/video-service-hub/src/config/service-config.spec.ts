import { resolveEnvReferences } from './service-config';

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
