import type { CameraRegistryEntry } from '../camera-registry/camera-registry.types';
import {
  buildFinalFileName,
  buildPartFileName,
  resolveCameraNaming,
} from './resource-naming';

function entry(
  overrides: Partial<CameraRegistryEntry> = {},
): CameraRegistryEntry {
  return {
    schemaVersion: 1,
    cameraId: 'camera-1',
    baseUrl: 'http://192.168.1.205',
    displayName: 'front',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('resolveCameraNaming', () => {
  it('uses the registered display name and hostname from baseUrl', () => {
    expect(resolveCameraNaming('camera-1', entry())).toEqual({
      name: 'front',
      ip: '192.168.1.205',
    });
  });

  it('falls back to the cameraId when there is no registry entry', () => {
    expect(resolveCameraNaming('camera-1', undefined)).toEqual({
      name: 'camera-1',
      ip: undefined,
    });
  });

  it('falls back to the cameraId when the entry has no displayName', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: undefined })),
    ).toEqual({
      name: 'camera-1',
      ip: '192.168.1.205',
    });
  });

  it('sanitizes a display name containing unsafe path characters', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: '../front cam!' }))
        .name,
    ).toBe('frontcam');
  });

  it('falls back to "unknown" if sanitizing empties the name entirely', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: '???' })).name,
    ).toBe('unknown');
  });
});

describe('buildFinalFileName', () => {
  it('builds each kind-specific final filename with name and ip', () => {
    const naming = { name: 'front', ip: '192.168.1.205' };
    expect(buildFinalFileName('captures', naming)).toBe(
      'image-front_(192.168.1.205).jpg',
    );
    expect(buildFinalFileName('timelapses', naming)).toBe(
      'timelapse-front_(192.168.1.205).mp4',
    );
    expect(buildFinalFileName('recordings', naming)).toBe(
      'recording-front_(192.168.1.205).mp4',
    );
    expect(buildFinalFileName('live', naming)).toBe(
      'live-front_(192.168.1.205).mp4',
    );
    expect(buildFinalFileName('audio', naming)).toBe(
      'audio-front_(192.168.1.205).wav',
    );
  });

  it('omits the ip suffix entirely when there is no ip', () => {
    expect(buildFinalFileName('captures', { name: 'front' })).toBe(
      'image-front.jpg',
    );
  });
});

describe('buildPartFileName', () => {
  it('pads part numbers to 3 digits, 1-based sequencing left to the caller', () => {
    expect(buildPartFileName('recordings', 0)).toBe('000.mjpeg');
    expect(buildPartFileName('recordings', 12)).toBe('012.mjpeg');
    expect(buildPartFileName('captures', 0)).toBe('000.jpg');
    expect(buildPartFileName('timelapses', 3)).toBe('003.jpg');
    expect(buildPartFileName('audio', 1)).toBe('001.wav');
  });
});
