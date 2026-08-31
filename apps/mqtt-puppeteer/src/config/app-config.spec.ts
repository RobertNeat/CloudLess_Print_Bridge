import { resolveEnvReferences } from './app-config';

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
