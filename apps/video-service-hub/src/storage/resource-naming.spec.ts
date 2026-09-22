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
    ).toBe('..front_cam');
  });

  it('falls back to "unknown" if sanitizing empties the name entirely', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: '???' })).name,
    ).toBe('unknown');
  });

  it('converts spaces in a multi-word display name to underscores', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: 'Front Door' }))
        .name,
    ).toBe('Front_Door');
  });

  it('preserves commas and periods in a display name', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ displayName: 'Front, Cam v1.2' }))
        .name,
    ).toBe('Front,_Cam_v1.2');
  });

  it('still resolves the ip from baseUrl for metadata/debugging purposes', () => {
    expect(
      resolveCameraNaming('camera-1', entry({ baseUrl: 'http://10.0.0.5' })).ip,
    ).toBe('10.0.0.5');
  });
});

describe('buildFinalFileName', () => {
  it('builds each kind-specific final filename from the name alone, ignoring ip', () => {
    const naming = { name: 'front', ip: '192.168.1.205' };
    expect(buildFinalFileName('captures', naming)).toBe('image-front.jpg');
    expect(buildFinalFileName('timelapses', naming)).toBe(
      'timelapse-front.mp4',
    );
    expect(buildFinalFileName('recordings', naming)).toBe(
      'recording-front.mp4',
    );
    expect(buildFinalFileName('live', naming)).toBe('live-front.mp4');
    expect(buildFinalFileName('audio', naming)).toBe('audio-front.wav');
  });

  it('never includes an ip in the filename, regardless of whether ip is set', () => {
    expect(buildFinalFileName('captures', { name: 'front' })).toBe(
      'image-front.jpg',
    );
    expect(
      buildFinalFileName('captures', { name: 'front', ip: '10.0.0.5' }),
    ).toBe('image-front.jpg');
  });

  it('builds from a sanitized multi-word display name', () => {
    expect(buildFinalFileName('audio', { name: 'Front_Door' })).toBe(
      'audio-Front_Door.wav',
    );
  });

  it('falls back to the sanitized cameraId when the camera is unregistered', () => {
    const naming = resolveCameraNaming('camera-42', undefined);
    expect(naming).toEqual({ name: 'camera-42', ip: undefined });
    expect(buildFinalFileName('recordings', naming)).toBe(
      'recording-camera-42.mp4',
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
